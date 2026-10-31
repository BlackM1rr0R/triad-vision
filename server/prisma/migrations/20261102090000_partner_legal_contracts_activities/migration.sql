-- AlterTable
ALTER TABLE `Company` ADD COLUMN `bankAccountHolder` VARCHAR(120) NULL,
    ADD COLUMN `bankName` VARCHAR(120) NULL,
    ADD COLUMN `betriebsnummer` VARCHAR(20) NULL,
    ADD COLUMN `bic` VARCHAR(11) NULL,
    ADD COLUMN `collectiveAgreement` VARCHAR(160) NULL,
    ADD COLUMN `country` VARCHAR(80) NULL,
    ADD COLUMN `employeeCount` INTEGER NULL,
    ADD COLUMN `fax` VARCHAR(40) NULL,
    ADD COLUMN `foundedYear` INTEGER NULL,
    ADD COLUMN `iban` VARCHAR(42) NULL,
    ADD COLUMN `managingDirector` VARCHAR(160) NULL,
    ADD COLUMN `postalCode` VARCHAR(12) NULL,
    ADD COLUMN `registerCourt` VARCHAR(120) NULL,
    ADD COLUMN `registerNumber` VARCHAR(40) NULL,
    ADD COLUMN `signatoryName` VARCHAR(160) NULL,
    ADD COLUMN `signatoryRole` VARCHAR(80) NULL,
    ADD COLUMN `street` VARCHAR(160) NULL,
    ADD COLUMN `taxNumber` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `Contact` ADD COLUMN `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `referralPartnerId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ContractTemplate` MODIFY `kind` ENUM('WORK', 'AUSBILDUNG', 'SERVICE', 'EMPLOYER', 'PARTNER') NOT NULL;

-- AlterTable
ALTER TABLE `ReferralPartner` ADD COLUMN `betriebsnummer` VARCHAR(20) NULL,
    ADD COLUMN `legalForm` VARCHAR(60) NULL,
    ADD COLUMN `postalCode` VARCHAR(12) NULL,
    ADD COLUMN `registerCourt` VARCHAR(120) NULL,
    ADD COLUMN `registerNumber` VARCHAR(40) NULL,
    ADD COLUMN `signatoryName` VARCHAR(160) NULL,
    ADD COLUMN `signatoryRole` VARCHAR(80) NULL,
    ADD COLUMN `street` VARCHAR(160) NULL,
    ADD COLUMN `vatId` VARCHAR(40) NULL;

-- CreateTable
CREATE TABLE `PartnerContract` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `referralPartnerId` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `kind` VARCHAR(20) NOT NULL DEFAULT 'COOPERATION',
    `status` VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    `startDate` DATE NULL,
    `endDate` DATE NULL,
    `autoRenew` BOOLEAN NOT NULL DEFAULT false,
    `noticePeriodDays` INTEGER NULL,
    `reminderDays` INTEGER NOT NULL DEFAULT 30,
    `reminderSentAt` DATETIME(3) NULL,
    `signedAt` DATETIME(3) NULL,
    `valueCents` INTEGER NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `templateId` VARCHAR(40) NULL,
    `fileName` VARCHAR(255) NULL,
    `filePath` VARCHAR(255) NULL,
    `mimeType` VARCHAR(100) NULL,
    `sizeBytes` INTEGER NULL,
    `signedFileName` VARCHAR(255) NULL,
    `signedFilePath` VARCHAR(255) NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PartnerContract_companyId_idx`(`companyId`),
    INDEX `PartnerContract_referralPartnerId_idx`(`referralPartnerId`),
    INDEX `PartnerContract_status_endDate_idx`(`status`, `endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerActivity` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `referralPartnerId` VARCHAR(191) NULL,
    `kind` VARCHAR(12) NOT NULL DEFAULT 'NOTE',
    `body` TEXT NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `contactId` VARCHAR(40) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PartnerActivity_companyId_at_idx`(`companyId`, `at`),
    INDEX `PartnerActivity_referralPartnerId_at_idx`(`referralPartnerId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Contact_referralPartnerId_idx` ON `Contact`(`referralPartnerId`);

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_referralPartnerId_fkey` FOREIGN KEY (`referralPartnerId`) REFERENCES `ReferralPartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerContract` ADD CONSTRAINT `PartnerContract_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerContract` ADD CONSTRAINT `PartnerContract_referralPartnerId_fkey` FOREIGN KEY (`referralPartnerId`) REFERENCES `ReferralPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerActivity` ADD CONSTRAINT `PartnerActivity_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerActivity` ADD CONSTRAINT `PartnerActivity_referralPartnerId_fkey` FOREIGN KEY (`referralPartnerId`) REFERENCES `ReferralPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


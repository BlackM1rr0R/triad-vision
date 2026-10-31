-- Authorities catalogue (Botschaft / Ausländerbehörde / other Behörden) and the links of cases to it.
-- Additive only: existing free-text values (Case.appointmentPlace, AcceleratedProcedure.authority,
-- RecognitionProcess.authority) stay as they are; staff link matching cases from the catalogue
-- (GET/POST /api/admin/authorities/:id/matches), because the catalogue starts empty.

-- AlterTable
ALTER TABLE `Case` ADD COLUMN `embassyAuthorityId` VARCHAR(191) NULL,
    ADD COLUMN `abhAuthorityId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Authority` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('EMBASSY', 'AUSLAENDERBEHOERDE', 'AGENTUR_FUER_ARBEIT', 'RECOGNITION', 'OTHER') NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `city` VARCHAR(120) NULL,
    `country` VARCHAR(80) NULL,
    `address` TEXT NULL,
    `website` VARCHAR(300) NULL,
    `email` VARCHAR(190) NULL,
    `phone` VARCHAR(60) NULL,
    `openingHours` TEXT NULL,
    `requirements` TEXT NULL,
    `checklist` JSON NULL,
    `notes` TEXT NULL,
    `waitingDaysManual` INTEGER NULL,
    `aliases` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Authority_type_active_idx`(`type`, `active`),
    INDEX `Authority_city_idx`(`city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthorityContact` (
    `id` VARCHAR(191) NOT NULL,
    `authorityId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `role` VARCHAR(120) NULL,
    `phone` VARCHAR(60) NULL,
    `email` VARCHAR(190) NULL,
    `note` VARCHAR(500) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AuthorityContact_authorityId_idx`(`authorityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseAuthority` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `authorityId` VARCHAR(191) NOT NULL,
    `note` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaseAuthority_authorityId_idx`(`authorityId`),
    UNIQUE INDEX `CaseAuthority_caseId_authorityId_key`(`caseId`, `authorityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Case_embassyAuthorityId_idx` ON `Case`(`embassyAuthorityId`);

-- CreateIndex
CREATE INDEX `Case_abhAuthorityId_idx` ON `Case`(`abhAuthorityId`);

-- AddForeignKey
ALTER TABLE `Case` ADD CONSTRAINT `Case_embassyAuthorityId_fkey` FOREIGN KEY (`embassyAuthorityId`) REFERENCES `Authority`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Case` ADD CONSTRAINT `Case_abhAuthorityId_fkey` FOREIGN KEY (`abhAuthorityId`) REFERENCES `Authority`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthorityContact` ADD CONSTRAINT `AuthorityContact_authorityId_fkey` FOREIGN KEY (`authorityId`) REFERENCES `Authority`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseAuthority` ADD CONSTRAINT `CaseAuthority_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseAuthority` ADD CONSTRAINT `CaseAuthority_authorityId_fkey` FOREIGN KEY (`authorityId`) REFERENCES `Authority`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

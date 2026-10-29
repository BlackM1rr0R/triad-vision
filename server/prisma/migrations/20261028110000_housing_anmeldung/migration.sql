-- CreateTable
CREATE TABLE `CaseHousing` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `city` VARCHAR(80) NULL,
    `budgetMax` INTEGER NULL,
    `housingSteps` JSON NULL,
    `bringItems` JSON NULL,
    `moveInDate` DATETIME(3) NULL,
    `contractVaultDocId` VARCHAR(40) NULL,
    `contractUploadedAt` DATETIME(3) NULL,
    `contractReview` ENUM('NONE', 'REQUESTED', 'REVIEWED') NOT NULL DEFAULT 'NONE',
    `contractQuestion` TEXT NULL,
    `contractReply` TEXT NULL,
    `contractReviewRequestedAt` DATETIME(3) NULL,
    `contractReviewedAt` DATETIME(3) NULL,
    `contractReviewedById` VARCHAR(40) NULL,
    `appointmentAt` DATETIME(3) NULL,
    `appointmentAddress` VARCHAR(300) NULL,
    `appointmentNote` VARCHAR(500) NULL,
    `appointmentSetAt` DATETIME(3) NULL,
    `appointmentSetById` VARCHAR(40) NULL,
    `meldeVaultDocId` VARCHAR(40) NULL,
    `anmeldungDoneAt` DATETIME(3) NULL,
    `anmeldungDoneVia` VARCHAR(12) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CaseHousing_caseId_key`(`caseId`),
    INDEX `CaseHousing_anmeldungDoneAt_moveInDate_idx`(`anmeldungDoneAt`, `moveInDate`),
    INDEX `CaseHousing_appointmentAt_idx`(`appointmentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerHousing` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `city` VARCHAR(80) NOT NULL,
    `type` ENUM('ROOM', 'SHARED_FLAT', 'APARTMENT', 'WORKER_HOUSING', 'BOARDING_HOUSE') NOT NULL DEFAULT 'APARTMENT',
    `priceMin` INTEGER NULL,
    `priceMax` INTEGER NULL,
    `description` TEXT NULL,
    `contactName` VARCHAR(160) NULL,
    `contactPhone` VARCHAR(60) NULL,
    `contactEmail` VARCHAR(190) NULL,
    `address` VARCHAR(300) NULL,
    `notes` TEXT NULL,
    `photos` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `companyId` VARCHAR(191) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PartnerHousing_active_city_idx`(`active`, `city`),
    INDEX `PartnerHousing_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HousingProposal` (
    `id` VARCHAR(191) NOT NULL,
    `listingId` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(10) NOT NULL DEFAULT 'STAFF',
    `staffNote` TEXT NULL,
    `response` ENUM('PENDING', 'INTERESTED', 'NOT_INTERESTED') NOT NULL DEFAULT 'PENDING',
    `clientNote` TEXT NULL,
    `respondedAt` DATETIME(3) NULL,
    `proposedById` VARCHAR(40) NULL,
    `introducedAt` DATETIME(3) NULL,
    `introducedById` VARCHAR(40) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HousingProposal_caseId_idx`(`caseId`),
    UNIQUE INDEX `HousingProposal_listingId_caseId_key`(`listingId`, `caseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CaseHousing` ADD CONSTRAINT `CaseHousing_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerHousing` ADD CONSTRAINT `PartnerHousing_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HousingProposal` ADD CONSTRAINT `HousingProposal_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `PartnerHousing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HousingProposal` ADD CONSTRAINT `HousingProposal_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


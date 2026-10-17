-- AlterTable
ALTER TABLE `Document` ADD COLUMN `checkedAt` DATETIME(3) NULL,
    ADD COLUMN `checks` JSON NULL,
    ADD COLUMN `vaultDocumentId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `CandidateCv` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `template` VARCHAR(20) NOT NULL DEFAULT 'lebenslauf',
    `shareWithEmployers` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CandidateCv_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MotivationLetter` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('VISA', 'JOB', 'ANERKENNUNG') NOT NULL,
    `caseId` VARCHAR(191) NULL,
    `vacancyId` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `language` VARCHAR(5) NOT NULL DEFAULT 'de',
    `answers` JSON NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MotivationLetter_userId_kind_idx`(`userId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VaultDocument` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('PASSPORT', 'ID_CARD', 'PHOTO', 'DIPLOMA', 'TRANSCRIPT', 'CERTIFICATE', 'EMPLOYMENT_REF', 'LANGUAGE_CERT', 'DRIVING_LICENCE', 'BIRTH_CERT', 'MARRIAGE_CERT', 'POLICE_CLEARANCE', 'CV', 'OTHER') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `ownerName` VARCHAR(160) NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `size` INTEGER NOT NULL,
    `issuedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `checks` JSON NULL,
    `ocr` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VaultDocument_storageKey_key`(`storageKey`),
    INDEX `VaultDocument_userId_kind_idx`(`userId`, `kind`),
    INDEX `VaultDocument_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ArrivalPlan` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `flightDate` DATETIME(3) NULL,
    `flightNumber` VARCHAR(20) NULL,
    `departureAirport` VARCHAR(80) NULL,
    `arrivalAirport` VARCHAR(80) NULL,
    `arrivalTime` DATETIME(3) NULL,
    `travellers` INTEGER NOT NULL DEFAULT 1,
    `luggageNote` VARCHAR(300) NULL,
    `pickupRequested` BOOLEAN NOT NULL DEFAULT false,
    `pickupConfirmed` BOOLEAN NOT NULL DEFAULT false,
    `pickupDetails` TEXT NULL,
    `housingStatus` ENUM('NONE', 'REQUESTED', 'SEARCHING', 'OFFERED', 'ARRANGED') NOT NULL DEFAULT 'NONE',
    `housingCity` VARCHAR(80) NULL,
    `housingBudget` INTEGER NULL,
    `housingFrom` DATETIME(3) NULL,
    `housingNote` TEXT NULL,
    `housingDetails` TEXT NULL,
    `clientNote` TEXT NULL,
    `staffNote` TEXT NULL,
    `handledById` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ArrivalPlan_caseId_key`(`caseId`),
    INDEX `ArrivalPlan_status_flightDate_idx`(`status`, `flightDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CandidateCv` ADD CONSTRAINT `CandidateCv_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MotivationLetter` ADD CONSTRAINT `MotivationLetter_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MotivationLetter` ADD CONSTRAINT `MotivationLetter_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VaultDocument` ADD CONSTRAINT `VaultDocument_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArrivalPlan` ADD CONSTRAINT `ArrivalPlan_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArrivalPlan` ADD CONSTRAINT `ArrivalPlan_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArrivalPlan` ADD CONSTRAINT `ArrivalPlan_handledById_fkey` FOREIGN KEY (`handledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


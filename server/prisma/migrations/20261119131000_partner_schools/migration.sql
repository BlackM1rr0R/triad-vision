-- Partner portal for colleges and language schools: partner category (AGENCY | SCHOOL | LANGUAGE_SCHOOL) and
-- language-school records of referred students (attendance, exam results with certificate; staff confirm). Plain ids.

-- AlterTable
ALTER TABLE `ReferralPartner` ADD COLUMN `category` VARCHAR(20) NOT NULL DEFAULT 'AGENCY';

-- CreateTable
CREATE TABLE `PartnerStudentRecord` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(40) NOT NULL,
    `clientId` VARCHAR(40) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `courseName` VARCHAR(160) NULL,
    `periodFrom` DATE NULL,
    `periodTo` DATE NULL,
    `attendancePct` INTEGER NULL,
    `level` VARCHAR(4) NULL,
    `examDate` DATE NULL,
    `provider` VARCHAR(40) NULL,
    `passed` BOOLEAN NULL,
    `note` TEXT NULL,
    `certificateKey` VARCHAR(120) NULL,
    `certificateName` VARCHAR(255) NULL,
    `certificateMime` VARCHAR(100) NULL,
    `certificateSize` INTEGER NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `reviewedById` VARCHAR(40) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `levelBefore` VARCHAR(4) NULL,
    `levelApplied` VARCHAR(4) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PartnerStudentRecord_partnerId_clientId_idx`(`partnerId`, `clientId`),
    INDEX `PartnerStudentRecord_clientId_idx`(`clientId`),
    INDEX `PartnerStudentRecord_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

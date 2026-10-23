-- CreateTable
CREATE TABLE `CaseFormTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(60) NULL,
    `title` JSON NOT NULL,
    `description` JSON NULL,
    `fields` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `builtIn` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CaseFormTemplate_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseForm` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NULL,
    `title` JSON NOT NULL,
    `fields` JSON NOT NULL,
    `answers` JSON NULL,
    `status` ENUM('SENT', 'DRAFT', 'SUBMITTED', 'APPLIED', 'CANCELLED') NOT NULL DEFAULT 'SENT',
    `note` TEXT NULL,
    `dueAt` DATETIME(3) NULL,
    `sentById` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `draftAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `submitIp` VARCHAR(64) NULL,
    `appliedAt` DATETIME(3) NULL,
    `appliedById` VARCHAR(191) NULL,
    `applied` JSON NULL,
    `remindedAt` DATETIME(3) NULL,
    `reminders` INTEGER NOT NULL DEFAULT 0,

    INDEX `CaseForm_caseId_status_idx`(`caseId`, `status`),
    INDEX `CaseForm_status_sentAt_idx`(`status`, `sentAt`),
    INDEX `CaseForm_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataConfirmation` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SUBMITTED', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `fields` JSON NOT NULL,
    `answers` JSON NULL,
    `decisions` JSON NULL,
    `snapshot` JSON NULL,
    `requestedById` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submittedAt` DATETIME(3) NULL,
    `submitIp` VARCHAR(64) NULL,
    `submitUserAgent` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `remindedAt` DATETIME(3) NULL,
    `reminders` INTEGER NOT NULL DEFAULT 0,

    INDEX `DataConfirmation_caseId_requestedAt_idx`(`caseId`, `requestedAt`),
    INDEX `DataConfirmation_status_requestedAt_idx`(`status`, `requestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseDataValue` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `value` TEXT NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `sourceId` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CaseDataValue_caseId_key_key`(`caseId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentGuide` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `content` JSON NOT NULL,
    `links` JSON NULL,
    `sampleImage` VARCHAR(300) NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `published` BOOLEAN NOT NULL DEFAULT true,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DocumentGuide_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CaseForm` ADD CONSTRAINT `CaseForm_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseForm` ADD CONSTRAINT `CaseForm_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `CaseFormTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataConfirmation` ADD CONSTRAINT `DataConfirmation_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseDataValue` ADD CONSTRAINT `CaseDataValue_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


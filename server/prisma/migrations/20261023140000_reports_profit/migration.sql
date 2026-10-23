-- CreateTable
CREATE TABLE `SavedReport` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `dataset` VARCHAR(40) NOT NULL,
    `config` JSON NOT NULL,
    `shared` BOOLEAN NOT NULL DEFAULT false,
    `ownerId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SavedReport_ownerId_idx`(`ownerId`),
    INDEX `SavedReport_shared_idx`(`shared`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `frequency` ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL,
    `weekday` INTEGER NULL,
    `monthDay` INTEGER NULL,
    `time` VARCHAR(5) NOT NULL DEFAULT '08:00',
    `recipientUserIds` JSON NOT NULL,
    `externalEmails` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(40) NULL,
    `lastPeriodKey` VARCHAR(20) NULL,
    `lastRunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ReportSchedule_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `periodKey` VARCHAR(20) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `rows` INTEGER NOT NULL DEFAULT 0,
    `recipients` JSON NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReportDelivery_scheduleId_createdAt_idx`(`scheduleId`, `createdAt`),
    UNIQUE INDEX `ReportDelivery_scheduleId_periodKey_key`(`scheduleId`, `periodKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseCost` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `category` ENUM('TRANSLATION', 'COURIER', 'EMBASSY_FEE', 'VISA_FEE', 'AGENT_COMMISSION', 'PARTNER_COMMISSION', 'TRAVEL', 'OTHER') NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `fxRate` DOUBLE NOT NULL,
    `incurredAt` DATETIME(3) NOT NULL,
    `note` TEXT NULL,
    `documentId` VARCHAR(40) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CaseCost_caseId_idx`(`caseId`),
    INDEX `CaseCost_incurredAt_idx`(`incurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- AddForeignKey
ALTER TABLE `ReportSchedule` ADD CONSTRAINT `ReportSchedule_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `SavedReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReportDelivery` ADD CONSTRAINT `ReportDelivery_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ReportSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseCost` ADD CONSTRAINT `CaseCost_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


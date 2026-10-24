-- AlterTable
ALTER TABLE `StaffPreferences` ADD COLUMN `dashboardLayout` JSON NULL;

-- CreateTable
CREATE TABLE `RecognitionProcess` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `clientId` VARCHAR(40) NOT NULL,
    `profession` VARCHAR(160) NOT NULL,
    `regulated` BOOLEAN NOT NULL DEFAULT false,
    `procedureType` VARCHAR(30) NOT NULL,
    `authority` VARCHAR(200) NULL,
    `federalState` VARCHAR(40) NULL,
    `reference` VARCHAR(120) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PREPARING',
    `checklist` JSON NULL,
    `submittedAt` DATETIME(3) NULL,
    `feeCents` INTEGER NULL,
    `feePaidAt` DATETIME(3) NULL,
    `decisionAt` DATETIME(3) NULL,
    `deficitNotes` TEXT NULL,
    `adaptationMeasure` VARCHAR(30) NULL,
    `adaptationUntil` DATETIME(3) NULL,
    `nextDeadline` DATETIME(3) NULL,
    `nextDeadlineNote` VARCHAR(300) NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RecognitionProcess_caseId_idx`(`caseId`),
    INDEX `RecognitionProcess_status_nextDeadline_idx`(`status`, `nextDeadline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecognitionEvent` (
    `id` VARCHAR(191) NOT NULL,
    `processId` VARCHAR(40) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `fromStatus` VARCHAR(20) NULL,
    `toStatus` VARCHAR(20) NULL,
    `note` TEXT NULL,
    `documentId` VARCHAR(40) NULL,
    `actorId` VARCHAR(40) NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecognitionEvent_processId_at_idx`(`processId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AcceleratedProcedure` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `companyId` VARCHAR(40) NULL,
    `authority` VARCHAR(200) NULL,
    `authorityEmail` VARCHAR(190) NULL,
    `reference` VARCHAR(120) NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'PREPARING',
    `powerOfAttorneyAt` DATETIME(3) NULL,
    `agreementSignedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `feeCents` INTEGER NULL,
    `feeRequestedAt` DATETIME(3) NULL,
    `feePaidAt` DATETIME(3) NULL,
    `preApprovalAt` DATETIME(3) NULL,
    `preApprovalDocId` VARCHAR(40) NULL,
    `embassyNotifiedAt` DATETIME(3) NULL,
    `appointmentDeadline` DATETIME(3) NULL,
    `appointmentAt` DATETIME(3) NULL,
    `decisionDeadline` DATETIME(3) NULL,
    `decidedAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AcceleratedProcedure_caseId_key`(`caseId`),
    INDEX `AcceleratedProcedure_status_idx`(`status`),
    INDEX `AcceleratedProcedure_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AcceleratedMessage` (
    `id` VARCHAR(191) NOT NULL,
    `procedureId` VARCHAR(40) NOT NULL,
    `direction` VARCHAR(4) NOT NULL,
    `channel` VARCHAR(10) NOT NULL,
    `subject` VARCHAR(300) NULL,
    `body` TEXT NULL,
    `documentId` VARCHAR(40) NULL,
    `dueAt` DATETIME(3) NULL,
    `actorId` VARCHAR(40) NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AcceleratedMessage_procedureId_at_idx`(`procedureId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- CreateTable
CREATE TABLE `AutomationRule` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `triggerType` VARCHAR(40) NOT NULL,
    `trigger` JSON NOT NULL,
    `conditions` JSON NOT NULL,
    `actions` JSON NOT NULL,
    `exampleKey` VARCHAR(60) NULL,
    `runCount` INTEGER NOT NULL DEFAULT 0,
    `lastRunAt` DATETIME(3) NULL,
    `createdById` VARCHAR(40) NULL,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AutomationRule_exampleKey_key`(`exampleKey`),
    INDEX `AutomationRule_enabled_triggerType_idx`(`enabled`, `triggerType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutomationEvent` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `entityType` VARCHAR(20) NOT NULL,
    `entityId` VARCHAR(40) NOT NULL,
    `caseId` VARCHAR(40) NULL,
    `payload` JSON NULL,
    `chain` JSON NULL,
    `depth` INTEGER NOT NULL DEFAULT 0,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AutomationEvent_processedAt_createdAt_idx`(`processedAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutomationRun` (
    `id` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `triggerType` VARCHAR(40) NOT NULL,
    `entityType` VARCHAR(20) NOT NULL,
    `entityId` VARCHAR(40) NOT NULL,
    `caseId` VARCHAR(40) NULL,
    `eventId` VARCHAR(40) NULL,
    `status` ENUM('RUNNING', 'WAITING', 'SUCCEEDED', 'PARTIAL', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `reason` TEXT NULL,
    `context` JSON NULL,
    `chain` JSON NULL,
    `depth` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    UNIQUE INDEX `AutomationRun_idempotencyKey_key`(`idempotencyKey`),
    INDEX `AutomationRun_ruleId_createdAt_idx`(`ruleId`, `createdAt`),
    INDEX `AutomationRun_entityId_createdAt_idx`(`entityId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutomationStep` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `index` INTEGER NOT NULL,
    `actionType` VARCHAR(40) NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `runAt` DATETIME(3) NOT NULL,
    `onlyIfStillTrue` BOOLEAN NOT NULL DEFAULT false,
    `reason` TEXT NULL,
    `result` JSON NULL,
    `executedAt` DATETIME(3) NULL,

    INDEX `AutomationStep_status_runAt_idx`(`status`, `runAt`),
    UNIQUE INDEX `AutomationStep_runId_index_key`(`runId`, `index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffPreferences` (
    `userId` VARCHAR(40) NOT NULL,
    `languages` JSON NULL,
    `visaTypes` JSON NULL,
    `visaCategoryIds` JSON NULL,
    `maxOpenCases` INTEGER NULL,
    `workingDays` JSON NULL,
    `autoAssign` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseHandover` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `originalStaffId` VARCHAR(40) NOT NULL,
    `substituteId` VARCHAR(40) NOT NULL,
    `leaveId` VARCHAR(40) NULL,
    `status` ENUM('ACTIVE', 'RETURNED', 'KEPT') NOT NULL DEFAULT 'ACTIVE',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `plannedEndAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,

    INDEX `CaseHandover_status_idx`(`status`),
    INDEX `CaseHandover_originalStaffId_status_idx`(`originalStaffId`, `status`),
    INDEX `CaseHandover_caseId_status_idx`(`caseId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AutomationRun` ADD CONSTRAINT `AutomationRun_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `AutomationRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutomationStep` ADD CONSTRAINT `AutomationStep_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `AutomationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


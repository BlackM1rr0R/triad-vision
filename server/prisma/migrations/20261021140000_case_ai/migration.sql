-- CreateTable
CREATE TABLE `CaseAiRun` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `kind` ENUM('CONSISTENCY', 'CONTRACT', 'VIDEX') NOT NULL,
    `subjectId` VARCHAR(191) NULL,
    `result` JSON NOT NULL,
    `model` VARCHAR(120) NULL,
    `costMicros` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CaseAiRun_caseId_kind_createdAt_idx`(`caseId`, `kind`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseAiFindingState` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `kind` ENUM('CONSISTENCY', 'CONTRACT', 'VIDEX') NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `status` ENUM('OK', 'FIXED', 'IGNORED') NOT NULL,
    `note` VARCHAR(300) NULL,
    `byId` VARCHAR(191) NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CaseAiFindingState_caseId_kind_key_key`(`caseId`, `kind`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- AddForeignKey
ALTER TABLE `CaseAiRun` ADD CONSTRAINT `CaseAiRun_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseAiFindingState` ADD CONSTRAINT `CaseAiFindingState_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

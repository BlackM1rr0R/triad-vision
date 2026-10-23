-- CreateTable
CREATE TABLE `TimeEntry` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `activity` ENUM('DOCUMENTS', 'CLIENT_COMMUNICATION', 'EMPLOYER_COMMUNICATION', 'TRANSLATION', 'EMBASSY', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `note` VARCHAR(1000) NULL,
    `source` VARCHAR(10) NOT NULL DEFAULT 'TIMER',
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `minutes` INTEGER NOT NULL DEFAULT 0,
    `runningKey` VARCHAR(64) NULL,
    `idleWarnedAt` DATETIME(3) NULL,
    `autoStopped` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TimeEntry_runningKey_key`(`runningKey`),
    INDEX `TimeEntry_userId_startedAt_idx`(`userId`, `startedAt`),
    INDEX `TimeEntry_caseId_startedAt_idx`(`caseId`, `startedAt`),
    INDEX `TimeEntry_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffCostRate` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `centsPerHour` INTEGER NOT NULL,
    `effectiveFrom` DATE NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffCostRate_userId_effectiveFrom_key`(`userId`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ArrivalFollowUp` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `arrivedAt` DATETIME(3) NOT NULL,
    `leftJobAt` DATETIME(3) NULL,
    `leftReason` VARCHAR(40) NULL,
    `leftNote` VARCHAR(1000) NULL,
    `leftMarkedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ArrivalFollowUp_caseId_key`(`caseId`),
    INDEX `ArrivalFollowUp_arrivedAt_idx`(`arrivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ArrivalCheckIn` (
    `id` VARCHAR(191) NOT NULL,
    `followUpId` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `audience` ENUM('WORKER', 'EMPLOYER') NOT NULL,
    `offsetDays` INTEGER NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `answer` ENUM('OK', 'ISSUE') NULL,
    `topics` JSON NULL,
    `comment` TEXT NULL,
    `answeredAt` DATETIME(3) NULL,
    `answeredById` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ArrivalCheckIn_tokenHash_key`(`tokenHash`),
    INDEX `ArrivalCheckIn_caseId_idx`(`caseId`),
    INDEX `ArrivalCheckIn_answer_resolvedAt_idx`(`answer`, `resolvedAt`),
    UNIQUE INDEX `ArrivalCheckIn_followUpId_audience_offsetDays_key`(`followUpId`, `audience`, `offsetDays`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentAccessLog` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorRole` VARCHAR(16) NULL,
    `documentId` VARCHAR(191) NULL,
    `caseId` VARCHAR(191) NULL,
    `action` VARCHAR(16) NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `firstAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentAccessLog_clientId_lastAt_idx`(`clientId`, `lastAt`),
    INDEX `DocumentAccessLog_actorId_documentId_action_lastAt_idx`(`actorId`, `documentId`, `action`, `lastAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArrivalFollowUp` ADD CONSTRAINT `ArrivalFollowUp_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArrivalCheckIn` ADD CONSTRAINT `ArrivalCheckIn_followUpId_fkey` FOREIGN KEY (`followUpId`) REFERENCES `ArrivalFollowUp`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

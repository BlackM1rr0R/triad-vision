-- CreateTable
CREATE TABLE `EmployerCandidateVote` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `voterName` VARCHAR(160) NOT NULL,
    `vote` VARCHAR(12) NOT NULL,
    `rejectReason` VARCHAR(20) NULL,
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployerCandidateVote_companyId_updatedAt_idx`(`companyId`, `updatedAt`),
    UNIQUE INDEX `EmployerCandidateVote_applicationId_userId_key`(`applicationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployerArrivalItem` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(40) NOT NULL,
    `key` VARCHAR(30) NULL,
    `label` VARCHAR(200) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneAt` DATETIME(3) NULL,
    `doneById` VARCHAR(40) NULL,
    `doneByName` VARCHAR(160) NULL,
    `dueDate` DATE NULL,
    `note` VARCHAR(1000) NULL,
    `visibleToWorker` BOOLEAN NOT NULL DEFAULT true,
    `remindedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployerArrivalItem_companyId_idx`(`companyId`),
    INDEX `EmployerArrivalItem_key_done_dueDate_idx`(`key`, `done`, `dueDate`),
    UNIQUE INDEX `EmployerArrivalItem_caseId_key_key`(`caseId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmployerCandidateVote` ADD CONSTRAINT `EmployerCandidateVote_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `VacancyApplication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployerCandidateVote` ADD CONSTRAINT `EmployerCandidateVote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployerArrivalItem` ADD CONSTRAINT `EmployerArrivalItem_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

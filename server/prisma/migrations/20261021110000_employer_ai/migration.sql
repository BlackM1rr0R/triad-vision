-- CreateTable
CREATE TABLE `CandidateProfileDraft` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `vacancyId` VARCHAR(191) NULL,
    `language` VARCHAR(5) NOT NULL DEFAULT 'de',
    `content` JSON NOT NULL,
    `model` VARCHAR(120) NULL,
    `costMicros` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `sharedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CandidateProfileDraft_applicationId_key`(`applicationId`),
    INDEX `CandidateProfileDraft_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CandidateProfileDraft` ADD CONSTRAINT `CandidateProfileDraft_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `VacancyApplication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidateProfileDraft` ADD CONSTRAINT `CandidateProfileDraft_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

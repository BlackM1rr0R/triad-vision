-- Interview calendar: employer availability (German time), booking rules, "pick a time" invites.

-- CreateTable
CREATE TABLE `InterviewAvailability` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `kind` ENUM('WEEKLY', 'DATE', 'BLOCK') NOT NULL,
    `weekday` INTEGER NULL,
    `day` VARCHAR(10) NULL,
    `startTime` VARCHAR(5) NULL,
    `endTime` VARCHAR(5) NULL,
    `note` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InterviewAvailability_companyId_kind_idx`(`companyId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterviewSchedulingSettings` (
    `companyId` VARCHAR(191) NOT NULL,
    `slotMinutes` INTEGER NOT NULL DEFAULT 45,
    `bufferMinutes` INTEGER NOT NULL DEFAULT 15,
    `minNoticeHours` INTEGER NOT NULL DEFAULT 24,
    `horizonDays` INTEGER NOT NULL DEFAULT 21,
    `cancelCutoffHours` INTEGER NOT NULL DEFAULT 12,
    `maxReschedules` INTEGER NOT NULL DEFAULT 2,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterviewInvite` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NULL,
    `candidateId` VARCHAR(191) NOT NULL,
    `minutes` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `status` ENUM('OPEN', 'BOOKED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `interviewId` VARCHAR(191) NULL,
    `reschedules` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InterviewInvite_interviewId_key`(`interviewId`),
    INDEX `InterviewInvite_candidateId_status_idx`(`candidateId`, `status`),
    INDEX `InterviewInvite_companyId_status_idx`(`companyId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InterviewAvailability` ADD CONSTRAINT `InterviewAvailability_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterviewSchedulingSettings` ADD CONSTRAINT `InterviewSchedulingSettings_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterviewInvite` ADD CONSTRAINT `InterviewInvite_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterviewInvite` ADD CONSTRAINT `InterviewInvite_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `VacancyApplication`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterviewInvite` ADD CONSTRAINT `InterviewInvite_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterviewInvite` ADD CONSTRAINT `InterviewInvite_interviewId_fkey` FOREIGN KEY (`interviewId`) REFERENCES `Interview`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

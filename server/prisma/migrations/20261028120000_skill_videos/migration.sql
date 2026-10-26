-- Skill videos: candidate-recorded / uploaded videos of a practical skill, staff review, employer views.

-- CreateTable
CREATE TABLE `SkillVideo` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(40) NULL,
    `title` VARCHAR(120) NOT NULL,
    `skill` VARCHAR(40) NOT NULL,
    `source` VARCHAR(10) NOT NULL,
    `storedName` VARCHAR(200) NOT NULL,
    `mimeType` VARCHAR(40) NOT NULL,
    `size` INTEGER NOT NULL,
    `durationSec` INTEGER NULL,
    `posterName` VARCHAR(200) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `rejectReason` TEXT NULL,
    `reviewedById` VARCHAR(40) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `consentAt` DATETIME(3) NULL,
    `consentWithdrawnAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SkillVideo_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `SkillVideo_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillVideoView` (
    `id` VARCHAR(191) NOT NULL,
    `videoId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(40) NOT NULL,
    `viewerId` VARCHAR(40) NULL,
    `applicationId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SkillVideoView_videoId_createdAt_idx`(`videoId`, `createdAt`),
    INDEX `SkillVideoView_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SkillVideo` ADD CONSTRAINT `SkillVideo_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillVideoView` ADD CONSTRAINT `SkillVideoView_videoId_fkey` FOREIGN KEY (`videoId`) REFERENCES `SkillVideo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

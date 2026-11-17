-- Staff onboarding & owner setup: "Yeniliklər" entries + per-user seen marks, new staff training checklist events,
-- owner setup checklist marks (lib/whatsNew, lib/staffOnboarding, lib/ownerSetup).

-- CreateTable
CREATE TABLE `WhatsNewEntry` (
    `id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `title` JSON NOT NULL,
    `body` JSON NOT NULL,
    `roles` JSON NOT NULL,
    `link` VARCHAR(300) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WhatsNewEntry_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsNewSeen` (
    `userId` VARCHAR(40) NOT NULL,
    `entryId` VARCHAR(60) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `entryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffTrainingEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `taskId` VARCHAR(40) NOT NULL,
    `ref` VARCHAR(60) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffTrainingEvent_userId_taskId_ref_key`(`userId`, `taskId`, `ref`),
    INDEX `StaffTrainingEvent_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OwnerSetupMark` (
    `itemId` VARCHAR(60) NOT NULL,
    `state` VARCHAR(12) NOT NULL,
    `note` VARCHAR(500) NULL,
    `markedById` VARCHAR(40) NULL,
    `markedByName` VARCHAR(200) NOT NULL,
    `markedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`itemId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

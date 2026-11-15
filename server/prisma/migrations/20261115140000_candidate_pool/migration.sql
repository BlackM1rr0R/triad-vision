-- CreateTable
CREATE TABLE `CandidatePoolProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `consentAt` DATETIME(3) NULL,
    `consentVersion` VARCHAR(40) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `professions` JSON NULL,
    `languages` JSON NULL,
    `regions` JSON NULL,
    `earliestStart` DATETIME(3) NULL,
    `availability` VARCHAR(16) NULL,
    `skills` JSON NULL,
    `track` VARCHAR(12) NOT NULL DEFAULT 'JOB',
    `staffReady` BOOLEAN NOT NULL DEFAULT false,
    `hidden` BOOLEAN NOT NULL DEFAULT false,
    `hiddenReason` VARCHAR(300) NULL,
    `summary` TEXT NULL,
    `staffUpdatedById` VARCHAR(40) NULL,
    `staffUpdatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CandidatePoolProfile_userId_key`(`userId`),
    UNIQUE INDEX `CandidatePoolProfile_code_key`(`code`),
    INDEX `CandidatePoolProfile_consentAt_hidden_idx`(`consentAt`, `hidden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CandidatePoolInterest` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(40) NULL,
    `message` TEXT NULL,
    `positions` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('NEW', 'CONTACTED', 'INTERVIEW', 'CLOSED') NOT NULL DEFAULT 'NEW',
    `staffNote` TEXT NULL,
    `handledById` VARCHAR(40) NULL,
    `statusChangedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CandidatePoolInterest_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `CandidatePoolInterest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `CandidatePoolInterest_profileId_idx`(`profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CandidatePoolSaved` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `savedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CandidatePoolSaved_companyId_profileId_key`(`companyId`, `profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CandidatePoolView` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `profileId` VARCHAR(191) NULL,
    `results` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CandidatePoolView_companyId_kind_createdAt_idx`(`companyId`, `kind`, `createdAt`),
    INDEX `CandidatePoolView_profileId_createdAt_idx`(`profileId`, `createdAt`),
    INDEX `CandidatePoolView_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CandidatePoolProfile` ADD CONSTRAINT `CandidatePoolProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidatePoolInterest` ADD CONSTRAINT `CandidatePoolInterest_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `CandidatePoolProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidatePoolInterest` ADD CONSTRAINT `CandidatePoolInterest_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidatePoolSaved` ADD CONSTRAINT `CandidatePoolSaved_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidatePoolSaved` ADD CONSTRAINT `CandidatePoolSaved_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `CandidatePoolProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidatePoolView` ADD CONSTRAINT `CandidatePoolView_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidatePoolView` ADD CONSTRAINT `CandidatePoolView_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `CandidatePoolProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


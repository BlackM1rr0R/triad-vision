-- SaaS "platform for agencies": demo-request pipeline (owner instance) and the onboarding wizard state of an
-- instance (plain ids, no foreign keys).

-- CreateTable
CREATE TABLE `SaasLead` (
    `id` VARCHAR(191) NOT NULL,
    `inquiryId` VARCHAR(40) NULL,
    `stage` VARCHAR(20) NOT NULL DEFAULT 'demo_requested',
    `agencyName` VARCHAR(200) NOT NULL,
    `country` VARCHAR(80) NULL,
    `website` VARCHAR(200) NULL,
    `teamSize` VARCHAR(10) NULL,
    `interests` JSON NULL,
    `demoAt` DATETIME(3) NULL,
    `customerId` VARCHAR(64) NULL,
    `staffNotes` TEXT NULL,
    `stageChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SaasLead_inquiryId_key`(`inquiryId`),
    INDEX `SaasLead_stage_idx`(`stage`),
    INDEX `SaasLead_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgencyOnboarding` (
    `id` VARCHAR(20) NOT NULL,
    `steps` JSON NOT NULL,
    `currentStep` VARCHAR(30) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `completedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

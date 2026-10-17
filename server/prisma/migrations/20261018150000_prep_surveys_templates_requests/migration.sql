-- CreateTable
CREATE TABLE `InterviewPrepQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('EMBASSY', 'EMPLOYER') NOT NULL,
    `category` VARCHAR(40) NOT NULL,
    `question` JSON NOT NULL,
    `answerDe` TEXT NOT NULL,
    `tips` JSON NULL,
    `visaTypes` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `published` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InterviewPrepQuestion_kind_published_sortOrder_idx`(`kind`, `published`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SatisfactionSurvey` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NULL,
    `trigger` ENUM('VISA_APPROVED', 'CASE_CLOSED') NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `score` INTEGER NULL,
    `ratings` JSON NULL,
    `comment` TEXT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `remindedAt` DATETIME(3) NULL,
    `answeredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SatisfactionSurvey_caseId_key`(`caseId`),
    UNIQUE INDEX `SatisfactionSurvey_tokenHash_key`(`tokenHash`),
    INDEX `SatisfactionSurvey_answeredAt_idx`(`answeredAt`),
    INDEX `SatisfactionSurvey_staffId_answeredAt_idx`(`staffId`, `answeredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `kind` ENUM('WORK', 'AUSBILDUNG', 'SERVICE') NOT NULL,
    `language` VARCHAR(5) NOT NULL DEFAULT 'de',
    `body` LONGTEXT NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ContractTemplate_kind_active_idx`(`kind`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CandidateRequest` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `profession` VARCHAR(120) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `visaCategoryId` VARCHAR(191) NULL,
    `germanLevel` VARCHAR(4) NULL,
    `drivingLicence` VARCHAR(40) NULL,
    `minExperience` INTEGER NULL,
    `city` VARCHAR(80) NULL,
    `startDate` DATETIME(3) NULL,
    `salaryMin` INTEGER NULL,
    `salaryMax` INTEGER NULL,
    `notes` TEXT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'FILLED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `vacancyId` VARCHAR(191) NULL,
    `staffNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CandidateRequest_companyId_status_idx`(`companyId`, `status`),
    INDEX `CandidateRequest_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SatisfactionSurvey` ADD CONSTRAINT `SatisfactionSurvey_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SatisfactionSurvey` ADD CONSTRAINT `SatisfactionSurvey_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SatisfactionSurvey` ADD CONSTRAINT `SatisfactionSurvey_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractTemplate` ADD CONSTRAINT `ContractTemplate_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidateRequest` ADD CONSTRAINT `CandidateRequest_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidateRequest` ADD CONSTRAINT `CandidateRequest_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


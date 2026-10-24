-- AlterTable
ALTER TABLE `ArrivalFollowUp` ADD COLUMN `riskAt` DATETIME(3) NULL,
    ADD COLUMN `riskLevel` VARCHAR(10) NULL,
    ADD COLUMN `riskReasons` JSON NULL,
    ADD COLUMN `riskScore` INTEGER NULL;

-- AlterTable
ALTER TABLE `Case` ADD COLUMN `probationReminderAt` DATETIME(3) NULL,
    ADD COLUMN `renewalCaseCreatedAt` DATETIME(3) NULL,
    ADD COLUMN `renewalOfCaseId` VARCHAR(40) NULL,
    ADD COLUMN `residenceTitleExpiresAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `CaseHandover` ADD COLUMN `checklist` JSON NULL,
    ADD COLUMN `note` TEXT NULL;

-- AlterTable
ALTER TABLE `ConsentRecord` ADD COLUMN `legalDocumentId` VARCHAR(40) NULL,
    ADD COLUMN `visitorId` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `FamilyMember` ADD COLUMN `docsCopiedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `InfoEvent` ADD COLUMN `recordingUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `Inquiry` ADD COLUMN `estimate` JSON NULL,
    ADD COLUMN `landingPageId` VARCHAR(40) NULL,
    ADD COLUMN `quizResult` JSON NULL,
    ADD COLUMN `score` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `scoreLevel` VARCHAR(10) NULL,
    ADD COLUMN `scoreReasons` JSON NULL,
    ADD COLUMN `scoredAt` DATETIME(3) NULL,
    ADD COLUMN `utm` JSON NULL,
    ADD COLUMN `visitorId` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `Post` ADD COLUMN `noindex` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `ogImage` TEXT NULL,
    ADD COLUMN `seoDescription` JSON NULL,
    ADD COLUMN `seoTitle` JSON NULL;

-- AlterTable
ALTER TABLE `Service` ADD COLUMN `noindex` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `ogImage` TEXT NULL,
    ADD COLUMN `seoDescription` JSON NULL,
    ADD COLUMN `seoTitle` JSON NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `introVideoKey` VARCHAR(300) NULL,
    ADD COLUMN `recognitionNote` VARCHAR(300) NULL,
    ADD COLUMN `recognitionStatus` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `VisaCategory` ADD COLUMN `noindex` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `ogImage` TEXT NULL,
    ADD COLUMN `seoDescription` JSON NULL,
    ADD COLUMN `seoTitle` JSON NULL;

-- CreateTable
CREATE TABLE `CandidateShareLink` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `candidateId` VARCHAR(40) NOT NULL,
    `applicationId` VARCHAR(40) NULL,
    `companyId` VARCHAR(40) NULL,
    `vacancyId` VARCHAR(40) NULL,
    `createdById` VARCHAR(40) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `lastViewedAt` DATETIME(3) NULL,
    `decision` VARCHAR(20) NULL,
    `decisionNote` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `decidedByName` VARCHAR(160) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CandidateShareLink_tokenHash_key`(`tokenHash`),
    INDEX `CandidateShareLink_candidateId_idx`(`candidateId`),
    INDEX `CandidateShareLink_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterviewEvaluation` (
    `id` VARCHAR(191) NOT NULL,
    `interviewId` VARCHAR(40) NOT NULL,
    `candidateId` VARCHAR(40) NOT NULL,
    `authorKind` VARCHAR(12) NOT NULL,
    `authorId` VARCHAR(40) NULL,
    `authorName` VARCHAR(160) NULL,
    `overall` INTEGER NOT NULL,
    `scores` JSON NOT NULL,
    `recommendation` VARCHAR(12) NOT NULL,
    `strengths` TEXT NULL,
    `concerns` TEXT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InterviewEvaluation_interviewId_idx`(`interviewId`),
    INDEX `InterviewEvaluation_candidateId_idx`(`candidateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmploymentContract` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `companyId` VARCHAR(40) NULL,
    `employerName` VARCHAR(200) NULL,
    `jobTitle` VARCHAR(160) NULL,
    `contractType` VARCHAR(20) NOT NULL DEFAULT 'UNLIMITED',
    `grossMonthly` DECIMAL(10, 2) NULL,
    `grossYearly` DECIMAL(12, 2) NULL,
    `weeklyHours` DECIMAL(4, 1) NULL,
    `vacationDays` INTEGER NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `probationMonths` INTEGER NULL,
    `probationEndsAt` DATETIME(3) NULL,
    `signedAt` DATETIME(3) NULL,
    `driveNodeId` VARCHAR(40) NULL,
    `blueCardCheck` VARCHAR(20) NULL,
    `warnings` JSON NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(40) NULL,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmploymentContract_caseId_key`(`caseId`),
    INDEX `EmploymentContract_probationEndsAt_idx`(`probationEndsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadVisitor` (
    `id` VARCHAR(40) NOT NULL,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `visits` INTEGER NOT NULL DEFAULT 1,
    `pageViews` INTEGER NOT NULL DEFAULT 0,
    `events` JSON NULL,
    `source` VARCHAR(80) NULL,
    `utm` JSON NULL,
    `locale` VARCHAR(8) NULL,
    `inquiryId` VARCHAR(40) NULL,

    INDEX `LeadVisitor_lastSeenAt_idx`(`lastSeenAt`),
    INDEX `LeadVisitor_inquiryId_idx`(`inquiryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LandingPage` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'az',
    `title` VARCHAR(200) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    `country` VARCHAR(40) NULL,
    `campaignId` VARCHAR(40) NULL,
    `sections` JSON NOT NULL,
    `formConfig` JSON NULL,
    `seoTitle` VARCHAR(200) NULL,
    `seoDescription` VARCHAR(400) NULL,
    `ogImage` TEXT NULL,
    `views` INTEGER NOT NULL DEFAULT 0,
    `submissions` INTEGER NOT NULL DEFAULT 0,
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LandingPage_slug_key`(`slug`),
    INDEX `LandingPage_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainingCourse` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `roles` JSON NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainingLesson` (
    `id` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(40) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` LONGTEXT NULL,
    `videoUrl` TEXT NULL,
    `driveNodeId` VARCHAR(40) NULL,
    `minutes` INTEGER NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `quiz` JSON NULL,
    `passScore` INTEGER NOT NULL DEFAULT 70,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TrainingLesson_courseId_sortOrder_idx`(`courseId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainingProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `courseId` VARCHAR(40) NOT NULL,
    `lessonId` VARCHAR(40) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `quizScore` INTEGER NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TrainingProgress_courseId_idx`(`courseId`),
    UNIQUE INDEX `TrainingProgress_userId_lessonId_key`(`userId`, `lessonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmbassyPackageApproval` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `packageHash` CHAR(64) NULL,
    `packageNodeId` VARCHAR(40) NULL,
    `requestedById` VARCHAR(40) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewerId` VARCHAR(40) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `comment` TEXT NULL,
    `checklist` JSON NULL,

    INDEX `EmbassyPackageApproval_caseId_requestedAt_idx`(`caseId`, `requestedAt`),
    INDEX `EmbassyPackageApproval_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffShift` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `date` DATE NOT NULL,
    `startMin` INTEGER NOT NULL,
    `endMin` INTEGER NOT NULL,
    `kind` VARCHAR(12) NOT NULL DEFAULT 'OFFICE',
    `note` VARCHAR(300) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffShift_date_idx`(`date`),
    INDEX `StaffShift_userId_date_idx`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WaitingRoomItem` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `topic` VARCHAR(40) NOT NULL,
    `title` JSON NOT NULL,
    `body` JSON NULL,
    `videoUrl` TEXT NULL,
    `exercise` JSON NULL,
    `minutes` INTEGER NULL,
    `visaTypes` JSON NULL,
    `stages` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `published` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WaitingRoomItem_published_sortOrder_idx`(`published`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WaitingRoomProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `itemId` VARCHAR(40) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `score` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WaitingRoomProgress_userId_itemId_key`(`userId`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LegalDocument` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `title` JSON NOT NULL,
    `body` JSON NOT NULL,
    `changeSummary` JSON NULL,
    `requiresReacceptance` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `effectiveAt` DATETIME(3) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LegalDocument_kind_status_idx`(`kind`, `status`),
    UNIQUE INDEX `LegalDocument_kind_version_key`(`kind`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuidePage` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `locale` VARCHAR(8) NOT NULL,
    `slug` VARCHAR(160) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` VARCHAR(400) NOT NULL,
    `body` LONGTEXT NOT NULL,
    `faq` JSON NULL,
    `published` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GuidePage_key_locale_key`(`key`, `locale`),
    UNIQUE INDEX `GuidePage_locale_slug_key`(`locale`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Inquiry_score_idx` ON `Inquiry`(`score`);

-- CreateIndex
CREATE INDEX `Inquiry_visitorId_idx` ON `Inquiry`(`visitorId`);


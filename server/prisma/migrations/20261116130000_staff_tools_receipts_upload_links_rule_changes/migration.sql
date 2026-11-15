-- Staff tools: originals receipt verification, login-free case upload links, rule-change notices (plain ids, no foreign keys).
-- CreateTable
CREATE TABLE `OriginalReceipt` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `actNodeId` VARCHAR(40) NOT NULL,
    `number` VARCHAR(80) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `itemCount` INTEGER NOT NULL,
    `staffFirstName` VARCHAR(80) NULL,
    `clientInitials` VARCHAR(8) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OriginalReceipt_code_key`(`code`),
    UNIQUE INDEX `OriginalReceipt_actNodeId_key`(`actNodeId`),
    INDEX `OriginalReceipt_caseId_idx`(`caseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseUploadLink` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `tokenPrefix` VARCHAR(16) NOT NULL,
    `requirementIds` JSON NOT NULL,
    `note` VARCHAR(500) NULL,
    `sentTo` VARCHAR(190) NULL,
    `createdById` VARCHAR(40) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(40) NULL,
    `uploadCount` INTEGER NOT NULL DEFAULT 0,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CaseUploadLink_tokenHash_key`(`tokenHash`),
    INDEX `CaseUploadLink_caseId_idx`(`caseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RuleChange` (
    `id` VARCHAR(191) NOT NULL,
    `title` JSON NOT NULL,
    `body` JSON NOT NULL,
    `visaTypes` JSON NOT NULL,
    `effectiveDate` DATETIME(3) NULL,
    `sourceUrl` VARCHAR(500) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(40) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishedById` VARCHAR(40) NULL,
    `recipientCount` INTEGER NOT NULL DEFAULT 0,
    `emailCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RuleChange_status_publishedAt_idx`(`status`, `publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RuleChangeRecipient` (
    `id` VARCHAR(191) NOT NULL,
    `ruleChangeId` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `emailed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RuleChangeRecipient_ruleChangeId_userId_key`(`ruleChangeId`, `userId`),
    INDEX `RuleChangeRecipient_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

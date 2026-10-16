-- AlterTable
ALTER TABLE `DriveGrant` MODIFY `role` ENUM('CLIENT', 'COMPANY', 'AGENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN') NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `referredAt` DATETIME(3) NULL,
    ADD COLUMN `referredByAgentId` VARCHAR(191) NULL,
    MODIFY `role` ENUM('CLIENT', 'COMPANY', 'AGENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'CLIENT';

-- CreateTable
CREATE TABLE `Agent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `region` VARCHAR(120) NULL,
    `company` VARCHAR(160) NULL,
    `status` ENUM('ACTIVE', 'PAUSED') NOT NULL DEFAULT 'ACTIVE',
    `commissionType` ENUM('FIXED', 'PERCENT') NOT NULL DEFAULT 'FIXED',
    `commissionValue` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `payoutEvents` JSON NULL,
    `iban` VARCHAR(64) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Agent_userId_key`(`userId`),
    UNIQUE INDEX `Agent_code_key`(`code`),
    INDEX `Agent_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentCommission` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `caseId` VARCHAR(191) NULL,
    `event` VARCHAR(40) NOT NULL,
    `sourceRef` VARCHAR(80) NULL,
    `amountCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `status` ENUM('PENDING', 'APPROVED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(500) NULL,
    `payoutRef` VARCHAR(120) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentCommission_agentId_status_idx`(`agentId`, `status`),
    INDEX `AgentCommission_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `AgentCommission_agentId_event_caseId_sourceRef_key`(`agentId`, `event`, `caseId`, `sourceRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TranslationOrder` (
    `id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NULL,
    `service` ENUM('TRANSLATION', 'APOSTILLE', 'TRANSLATION_APOSTILLE', 'NOTARY') NOT NULL,
    `sourceLang` VARCHAR(8) NOT NULL,
    `targetLang` VARCHAR(8) NOT NULL,
    `documentTypes` JSON NULL,
    `pages` INTEGER NOT NULL DEFAULT 1,
    `urgency` ENUM('STANDARD', 'EXPRESS') NOT NULL DEFAULT 'STANDARD',
    `status` ENUM('NEW', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
    `priceCents` INTEGER NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `quoteNote` TEXT NULL,
    `dueAt` DATETIME(3) NULL,
    `deliveryMethod` ENUM('DIGITAL', 'PICKUP', 'COURIER') NOT NULL DEFAULT 'DIGITAL',
    `deliveryAddress` VARCHAR(300) NULL,
    `trackingNumber` VARCHAR(80) NULL,
    `clientNote` TEXT NULL,
    `staffNote` TEXT NULL,
    `assignedStaffId` VARCHAR(191) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TranslationOrder_number_key`(`number`),
    INDEX `TranslationOrder_clientId_createdAt_idx`(`clientId`, `createdAt`),
    INDEX `TranslationOrder_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TranslationOrderFile` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `kind` ENUM('SOURCE', 'RESULT') NOT NULL,
    `documentId` VARCHAR(191) NULL,
    `storageKey` VARCHAR(191) NULL,
    `filename` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `size` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TranslationOrderFile_storageKey_key`(`storageKey`),
    INDEX `TranslationOrderFile_orderId_kind_idx`(`orderId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TranslationOrderEvent` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `status` ENUM('NEW', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED') NULL,
    `note` TEXT NULL,
    `visibleToClient` BOOLEAN NOT NULL DEFAULT true,
    `actorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TranslationOrderEvent_orderId_createdAt_idx`(`orderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsentRecord` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `email` VARCHAR(200) NULL,
    `type` VARCHAR(40) NOT NULL,
    `granted` BOOLEAN NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `source` VARCHAR(40) NOT NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(400) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConsentRecord_userId_type_createdAt_idx`(`userId`, `type`, `createdAt`),
    INDEX `ConsentRecord_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrivacyRequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `email` VARCHAR(200) NOT NULL,
    `type` ENUM('EXPORT', 'DELETION', 'RECTIFICATION', 'RESTRICTION', 'OBJECTION') NOT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `message` TEXT NULL,
    `decisionNote` TEXT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `handledById` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PrivacyRequest_status_dueAt_idx`(`status`, `dueAt`),
    INDEX `PrivacyRequest_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_referredByAgentId_fkey` FOREIGN KEY (`referredByAgentId`) REFERENCES `Agent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agent` ADD CONSTRAINT `Agent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentCommission` ADD CONSTRAINT `AgentCommission_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentCommission` ADD CONSTRAINT `AgentCommission_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentCommission` ADD CONSTRAINT `AgentCommission_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TranslationOrder` ADD CONSTRAINT `TranslationOrder_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TranslationOrder` ADD CONSTRAINT `TranslationOrder_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TranslationOrder` ADD CONSTRAINT `TranslationOrder_assignedStaffId_fkey` FOREIGN KEY (`assignedStaffId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TranslationOrderFile` ADD CONSTRAINT `TranslationOrderFile_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `TranslationOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TranslationOrderEvent` ADD CONSTRAINT `TranslationOrderEvent_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `TranslationOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TranslationOrderEvent` ADD CONSTRAINT `TranslationOrderEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsentRecord` ADD CONSTRAINT `ConsentRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrivacyRequest` ADD CONSTRAINT `PrivacyRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrivacyRequest` ADD CONSTRAINT `PrivacyRequest_handledById_fkey` FOREIGN KEY (`handledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


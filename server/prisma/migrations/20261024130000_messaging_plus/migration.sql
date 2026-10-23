-- AlterTable
ALTER TABLE `CaseMessage` ADD COLUMN `lang` ENUM('az', 'de', 'en', 'ru') NULL,
    ADD COLUMN `voiceId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `showOriginalMessages` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `MessageTranslation` (
    `id` VARCHAR(191) NOT NULL,
    `caseMessageId` VARCHAR(191) NULL,
    `partyMessageId` VARCHAR(191) NULL,
    `lang` ENUM('az', 'de', 'en', 'ru') NOT NULL,
    `sourceHash` VARCHAR(64) NOT NULL,
    `text` TEXT NOT NULL,
    `model` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MessageTranslation_caseMessageId_lang_key`(`caseMessageId`, `lang`),
    UNIQUE INDEX `MessageTranslation_partyMessageId_lang_key`(`partyMessageId`, `lang`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartyThread` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NULL,
    `caseId` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `candidateId` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `showCompany` BOOLEAN NOT NULL DEFAULT false,
    `pins` JSON NULL,
    `createdById` VARCHAR(191) NULL,
    `closedAt` DATETIME(3) NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PartyThread_applicationId_key`(`applicationId`),
    UNIQUE INDEX `PartyThread_caseId_key`(`caseId`),
    INDEX `PartyThread_companyId_idx`(`companyId`),
    INDEX `PartyThread_candidateId_idx`(`candidateId`),
    INDEX `PartyThread_status_lastMessageAt_idx`(`status`, `lastMessageAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartyThreadMember` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `side` ENUM('CANDIDATE', 'COMPANY', 'STAFF') NOT NULL,
    `lastReadAt` DATETIME(3) NULL,
    `notifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartyThreadMember_userId_idx`(`userId`),
    UNIQUE INDEX `PartyThreadMember_threadId_userId_key`(`threadId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartyThreadMessage` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `side` ENUM('CANDIDATE', 'COMPANY', 'STAFF') NOT NULL,
    `body` TEXT NOT NULL,
    `lang` ENUM('az', 'de', 'en', 'ru') NULL,
    `voiceId` VARCHAR(191) NULL,
    `status` ENUM('VISIBLE', 'HELD', 'REJECTED', 'HIDDEN', 'DELETED') NOT NULL DEFAULT 'VISIBLE',
    `holdReason` VARCHAR(40) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PartyThreadMessage_voiceId_key`(`voiceId`),
    INDEX `PartyThreadMessage_threadId_createdAt_idx`(`threadId`, `createdAt`),
    INDEX `PartyThreadMessage_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoiceClip` (
    `id` VARCHAR(191) NOT NULL,
    `uploaderId` VARCHAR(191) NOT NULL,
    `storedName` VARCHAR(160) NOT NULL,
    `mimeType` VARCHAR(60) NOT NULL,
    `size` INTEGER NOT NULL,
    `durationMs` INTEGER NOT NULL,
    `transcriptStatus` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `transcript` TEXT NULL,
    `transcriptLang` ENUM('az', 'de', 'en', 'ru') NULL,
    `transcriptError` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `CaseMessage_voiceId_key` ON `CaseMessage`(`voiceId`);

-- AddForeignKey
ALTER TABLE `CaseMessage` ADD CONSTRAINT `CaseMessage_voiceId_fkey` FOREIGN KEY (`voiceId`) REFERENCES `VoiceClip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageTranslation` ADD CONSTRAINT `MessageTranslation_caseMessageId_fkey` FOREIGN KEY (`caseMessageId`) REFERENCES `CaseMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageTranslation` ADD CONSTRAINT `MessageTranslation_partyMessageId_fkey` FOREIGN KEY (`partyMessageId`) REFERENCES `PartyThreadMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThread` ADD CONSTRAINT `PartyThread_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `VacancyApplication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThread` ADD CONSTRAINT `PartyThread_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThread` ADD CONSTRAINT `PartyThread_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThread` ADD CONSTRAINT `PartyThread_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThread` ADD CONSTRAINT `PartyThread_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThreadMember` ADD CONSTRAINT `PartyThreadMember_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `PartyThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThreadMember` ADD CONSTRAINT `PartyThreadMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThreadMessage` ADD CONSTRAINT `PartyThreadMessage_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `PartyThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThreadMessage` ADD CONSTRAINT `PartyThreadMessage_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyThreadMessage` ADD CONSTRAINT `PartyThreadMessage_voiceId_fkey` FOREIGN KEY (`voiceId`) REFERENCES `VoiceClip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoiceClip` ADD CONSTRAINT `VoiceClip_uploaderId_fkey` FOREIGN KEY (`uploaderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


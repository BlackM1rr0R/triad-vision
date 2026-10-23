-- CreateTable
CREATE TABLE `Call` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `providerCallId` VARCHAR(80) NULL,
    `providerLegId` VARCHAR(80) NULL,
    `direction` ENUM('OUTBOUND', 'INBOUND') NOT NULL,
    `fromNumber` VARCHAR(40) NOT NULL,
    `toNumber` VARCHAR(40) NOT NULL,
    `staffId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `caseId` VARCHAR(191) NULL,
    `inquiryId` VARCHAR(191) NULL,
    `callbackId` VARCHAR(191) NULL,
    `liveChatId` VARCHAR(191) NULL,
    `status` ENUM('QUEUED', 'RINGING_STAFF', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'QUEUED',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `answeredAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `durationSec` INTEGER NULL,
    `recorded` BOOLEAN NOT NULL DEFAULT false,
    `recordingKey` VARCHAR(200) NULL,
    `transcript` TEXT NULL,
    `summary` TEXT NULL,
    `followUps` JSON NULL,
    `outcome` ENUM('REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'CALL_BACK') NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Call_providerCallId_idx`(`providerCallId`),
    INDEX `Call_providerLegId_idx`(`providerLegId`),
    INDEX `Call_clientId_startedAt_idx`(`clientId`, `startedAt`),
    INDEX `Call_caseId_startedAt_idx`(`caseId`, `startedAt`),
    INDEX `Call_inquiryId_idx`(`inquiryId`),
    INDEX `Call_staffId_startedAt_idx`(`staffId`, `startedAt`),
    INDEX `Call_callbackId_idx`(`callbackId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CallbackRequest` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(40) NOT NULL,
    `email` VARCHAR(200) NULL,
    `locale` VARCHAR(2) NOT NULL,
    `topic` VARCHAR(40) NULL,
    `message` TEXT NULL,
    `asap` BOOLEAN NOT NULL DEFAULT false,
    `windowStart` DATETIME(3) NOT NULL,
    `windowEnd` DATETIME(3) NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `inquiryId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `assigneeIds` JSON NULL,
    `status` ENUM('PENDING', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `outcome` ENUM('REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'CALL_BACK') NULL,
    `note` TEXT NULL,
    `callId` VARCHAR(191) NULL,
    `remindedAt` DATETIME(3) NULL,
    `doneAt` DATETIME(3) NULL,
    `doneById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CallbackRequest_status_windowStart_idx`(`status`, `windowStart`),
    INDEX `CallbackRequest_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveChat` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('WAITING', 'ACTIVE', 'CLOSED', 'MISSED') NOT NULL DEFAULT 'WAITING',
    `locale` VARCHAR(2) NOT NULL,
    `visitorName` VARCHAR(120) NULL,
    `visitorEmail` VARCHAR(200) NULL,
    `visitorPhone` VARCHAR(40) NULL,
    `transcript` JSON NULL,
    `pageUrl` VARCHAR(300) NULL,
    `reason` VARCHAR(20) NULL,
    `staffId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `inquiryId` VARCHAR(191) NULL,
    `callbackId` VARCHAR(191) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `lastVisitorAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LiveChat_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `LiveChat_staffId_status_idx`(`staffId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `author` VARCHAR(8) NOT NULL,
    `staffId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LiveChatMessage_chatId_createdAt_idx`(`chatId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- AddForeignKey
ALTER TABLE `LiveChatMessage` ADD CONSTRAINT `LiveChatMessage_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `LiveChat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


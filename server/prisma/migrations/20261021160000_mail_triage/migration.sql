-- CreateTable
CREATE TABLE `MailTriage` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `rfcMessageId` VARCHAR(500) NULL,
    `status` ENUM('PENDING', 'NEW', 'ACTIONED', 'DISMISSED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `category` ENUM('CANDIDATE', 'EMPLOYER', 'PARTNER', 'EXISTING_CLIENT', 'SUPPLIER', 'SPAM', 'OTHER') NULL,
    `urgency` ENUM('URGENT', 'NORMAL', 'LOW') NULL,
    `language` VARCHAR(8) NULL,
    `summary` JSON NULL,
    `contact` JSON NULL,
    `intent` VARCHAR(300) NULL,
    `visaCategorySlug` VARCHAR(120) NULL,
    `assigneeRole` VARCHAR(40) NULL,
    `existingClient` JSON NULL,
    `suggestedAssigneeId` VARCHAR(191) NULL,
    `replyDraft` JSON NULL,
    `leadInquiryId` VARCHAR(191) NULL,
    `assignedToId` VARCHAR(191) NULL,
    `actions` JSON NULL,
    `skipReason` VARCHAR(40) NULL,
    `error` VARCHAR(120) NULL,
    `model` VARCHAR(120) NULL,
    `costMicros` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MailTriage_messageId_key`(`messageId`),
    INDEX `MailTriage_accountId_createdAt_idx`(`accountId`, `createdAt`),
    INDEX `MailTriage_rfcMessageId_idx`(`rfcMessageId`),
    INDEX `MailTriage_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MailTriage` ADD CONSTRAINT `MailTriage_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `MailMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- "E-mail me my result" on the public tools: e-mail state of a tool lead (the lead itself is an Inquiry with
-- source "tool:<slug>"; plain id, no foreign key). Tool analytics reuse AnalyticsDaily (metrics tool_*).

-- CreateTable
CREATE TABLE `ToolResultLead` (
    `id` VARCHAR(191) NOT NULL,
    `tool` VARCHAR(60) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `name` VARCHAR(120) NULL,
    `locale` VARCHAR(5) NOT NULL,
    `inquiryId` VARCHAR(40) NULL,
    `followUpConsent` BOOLEAN NOT NULL DEFAULT false,
    `confirmedAt` DATETIME(3) NULL,
    `followUpDueAt` DATETIME(3) NULL,
    `followUpSentAt` DATETIME(3) NULL,
    `unsubscribedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ToolResultLead_followUpDueAt_idx`(`followUpDueAt`),
    INDEX `ToolResultLead_email_idx`(`email`),
    INDEX `ToolResultLead_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

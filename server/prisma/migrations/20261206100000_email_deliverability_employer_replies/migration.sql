-- E-mail deliverability (lib/deliverability): SMTP code, Message-ID and recipient domain on EmailLog, bounce /
-- complaint reports, suppression list. Employer replies to automatic applications (lib/germanyJobs/replies).
ALTER TABLE `EmailLog`
    ADD COLUMN `responseCode` INTEGER NULL,
    ADD COLUMN `messageId` VARCHAR(500) NULL,
    ADD COLUMN `toDomain` VARCHAR(190) NULL,
    ADD COLUMN `category` VARCHAR(24) NULL;

CREATE INDEX `EmailLog_createdAt_idx` ON `EmailLog`(`createdAt`);
CREATE INDEX `EmailLog_messageId_idx` ON `EmailLog`(`messageId`);
CREATE INDEX `EmailLog_category_createdAt_idx` ON `EmailLog`(`category`, `createdAt`);

CREATE TABLE `EmailBounce` (
    `id` VARCHAR(191) NOT NULL,
    `address` VARCHAR(190) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `status` VARCHAR(40) NULL,
    `diagnostic` VARCHAR(500) NULL,
    `source` VARCHAR(10) NOT NULL,
    `reportMessageId` VARCHAR(500) NULL,
    `originalMessageId` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailBounce_reportMessageId_address_key`(`reportMessageId`, `address`),
    INDEX `EmailBounce_createdAt_idx`(`createdAt`),
    INDEX `EmailBounce_address_idx`(`address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmailSuppression` (
    `id` VARCHAR(191) NOT NULL,
    `address` VARCHAR(190) NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `detail` VARCHAR(500) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmailSuppression_address_key`(`address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ExternalJobApplication` ADD COLUMN `autoMessageId` VARCHAR(500) NULL;
CREATE INDEX `ExternalJobApplication_autoMessageId_idx` ON `ExternalJobApplication`(`autoMessageId`);

CREATE TABLE `ExternalJobApplicationReply` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NOT NULL,
    `rfcMessageId` VARCHAR(500) NOT NULL,
    `mailMessageId` VARCHAR(40) NULL,
    `fromAddr` VARCHAR(255) NULL,
    `fromName` VARCHAR(255) NULL,
    `subject` VARCHAR(1000) NULL,
    `excerpt` TEXT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `matchedBy` VARCHAR(12) NOT NULL,
    `classification` VARCHAR(12) NOT NULL,
    `suggestedStatus` VARCHAR(20) NULL,
    `resolution` VARCHAR(10) NULL,
    `resolvedById` VARCHAR(40) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExternalJobApplicationReply_applicationId_rfcMessageId_key`(`applicationId`, `rfcMessageId`),
    INDEX `ExternalJobApplicationReply_resolution_createdAt_idx`(`resolution`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ExternalJobApplicationReply` ADD CONSTRAINT `ExternalJobApplicationReply_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `ExternalJobApplication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

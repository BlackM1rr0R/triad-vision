-- Shared workspace mailboxes (lib/mail/access): a SUPER_ADMIN gives a colleague read or read + send access
-- to another staff member's mailbox. Rows go with the mailbox and with the user.
CREATE TABLE `MailAccountGrant` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `level` ENUM('READ', 'SEND') NOT NULL DEFAULT 'READ',
    `grantedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MailAccountGrant_userId_idx`(`userId`),
    UNIQUE INDEX `MailAccountGrant_accountId_userId_key`(`accountId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MailAccountGrant` ADD CONSTRAINT `MailAccountGrant_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MailAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MailAccountGrant` ADD CONSTRAINT `MailAccountGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

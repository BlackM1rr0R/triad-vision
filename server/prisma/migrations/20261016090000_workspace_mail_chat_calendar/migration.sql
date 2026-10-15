-- AlterTable
ALTER TABLE `User` ADD COLUMN `statusEmoji` VARCHAR(16) NULL,
    ADD COLUMN `statusText` VARCHAR(120) NULL,
    ADD COLUMN `statusUntil` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `MailAccount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `displayName` VARCHAR(120) NULL,
    `provider` ENUM('GMAIL', 'OUTLOOK', 'YANDEX', 'MAILRU', 'CUSTOM') NOT NULL DEFAULT 'CUSTOM',
    `imapHost` VARCHAR(190) NOT NULL,
    `imapPort` INTEGER NOT NULL DEFAULT 993,
    `imapSecure` BOOLEAN NOT NULL DEFAULT true,
    `smtpHost` VARCHAR(190) NOT NULL,
    `smtpPort` INTEGER NOT NULL DEFAULT 465,
    `smtpSecure` BOOLEAN NOT NULL DEFAULT true,
    `username` VARCHAR(190) NOT NULL,
    `passwordEnc` TEXT NOT NULL,
    `signatureHtml` TEXT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `syncEnabled` BOOLEAN NOT NULL DEFAULT true,
    `syncStatus` ENUM('IDLE', 'SYNCING', 'OK', 'ERROR') NOT NULL DEFAULT 'IDLE',
    `syncError` VARCHAR(500) NULL,
    `lastSyncAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MailAccount_userId_email_key`(`userId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailFolder` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `role` ENUM('INBOX', 'SENT', 'DRAFTS', 'TRASH', 'JUNK', 'ARCHIVE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `delimiter` VARCHAR(4) NULL,
    `uidValidity` BIGINT NULL,
    `lastUid` BIGINT NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL DEFAULT 0,
    `unread` INTEGER NOT NULL DEFAULT 0,
    `subscribed` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `MailFolder_accountId_path_key`(`accountId`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailMessage` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NOT NULL,
    `uid` BIGINT NULL,
    `messageId` VARCHAR(500) NULL,
    `inReplyTo` VARCHAR(500) NULL,
    `refs` TEXT NULL,
    `threadKey` VARCHAR(190) NULL,
    `subject` VARCHAR(1000) NULL,
    `fromName` VARCHAR(255) NULL,
    `fromAddr` VARCHAR(255) NULL,
    `toList` JSON NOT NULL,
    `ccList` JSON NULL,
    `bccList` JSON NULL,
    `replyTo` VARCHAR(255) NULL,
    `date` DATETIME(3) NOT NULL,
    `snippet` VARCHAR(300) NULL,
    `text` LONGTEXT NULL,
    `html` LONGTEXT NULL,
    `hasAttachments` BOOLEAN NOT NULL DEFAULT false,
    `size` INTEGER NULL,
    `seen` BOOLEAN NOT NULL DEFAULT false,
    `flagged` BOOLEAN NOT NULL DEFAULT false,
    `answered` BOOLEAN NOT NULL DEFAULT false,
    `isDraft` BOOLEAN NOT NULL DEFAULT false,
    `snoozedUntil` DATETIME(3) NULL,
    `caseId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MailMessage_accountId_date_idx`(`accountId`, `date`),
    INDEX `MailMessage_accountId_threadKey_idx`(`accountId`, `threadKey`),
    INDEX `MailMessage_accountId_seen_idx`(`accountId`, `seen`),
    INDEX `MailMessage_messageId_idx`(`messageId`),
    INDEX `MailMessage_snoozedUntil_idx`(`snoozedUntil`),
    UNIQUE INDEX `MailMessage_folderId_uid_key`(`folderId`, `uid`),
    FULLTEXT INDEX `MailMessage_subject_text_idx`(`subject`, `text`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `size` INTEGER NOT NULL,
    `contentId` VARCHAR(255) NULL,
    `inline` BOOLEAN NOT NULL DEFAULT false,
    `partId` VARCHAR(40) NULL,
    `storageKey` VARCHAR(191) NULL,

    UNIQUE INDEX `MailAttachment_storageKey_key`(`storageKey`),
    INDEX `MailAttachment_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailLabel` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `color` VARCHAR(20) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `MailLabel_userId_name_key`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailMessageLabel` (
    `messageId` VARCHAR(191) NOT NULL,
    `labelId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`messageId`, `labelId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailRule` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `name` VARCHAR(80) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `conditions` JSON NOT NULL,
    `actions` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `shared` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(80) NOT NULL,
    `subject` VARCHAR(300) NULL,
    `html` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatChannel` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('PUBLIC', 'PRIVATE', 'DM') NOT NULL,
    `name` VARCHAR(80) NULL,
    `topic` VARCHAR(250) NULL,
    `caseId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChatChannel_kind_archivedAt_idx`(`kind`, `archivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMember` (
    `id` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastReadAt` DATETIME(3) NULL,
    `muted` BOOLEAN NOT NULL DEFAULT false,
    `pinned` BOOLEAN NOT NULL DEFAULT false,

    INDEX `ChatMember_userId_idx`(`userId`),
    UNIQUE INDEX `ChatMember_channelId_userId_key`(`channelId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `replyCount` INTEGER NOT NULL DEFAULT 0,
    `mentions` JSON NULL,
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `pinnedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_channelId_createdAt_idx`(`channelId`, `createdAt`),
    INDEX `ChatMessage_parentId_idx`(`parentId`),
    FULLTEXT INDEX `ChatMessage_body_idx`(`body`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `size` INTEGER NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `driveNodeId` VARCHAR(191) NULL,

    UNIQUE INDEX `ChatAttachment_storageKey_key`(`storageKey`),
    INDEX `ChatAttachment_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatReaction` (
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`messageId`, `userId`, `emoji`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalendarEvent` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `location` VARCHAR(255) NULL,
    `meetingUrl` VARCHAR(500) NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `allDay` BOOLEAN NOT NULL DEFAULT false,
    `color` VARCHAR(20) NULL,
    `visibility` ENUM('PRIVATE', 'TEAM') NOT NULL DEFAULT 'TEAM',
    `rrule` VARCHAR(255) NULL,
    `reminderMinutes` INTEGER NULL,
    `caseId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CalendarEvent_startsAt_idx`(`startsAt`),
    INDEX `CalendarEvent_ownerId_startsAt_idx`(`ownerId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalendarAttendee` (
    `eventId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('NEEDS_ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE') NOT NULL DEFAULT 'NEEDS_ACTION',

    INDEX `CalendarAttendee_userId_idx`(`userId`),
    PRIMARY KEY (`eventId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
    `id` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `shared` BOOLEAN NOT NULL DEFAULT true,
    `firstName` VARCHAR(80) NOT NULL,
    `lastName` VARCHAR(80) NULL,
    `email` VARCHAR(190) NULL,
    `emails` JSON NULL,
    `phone` VARCHAR(40) NULL,
    `company` VARCHAR(120) NULL,
    `companyId` VARCHAR(191) NULL,
    `position` VARCHAR(120) NULL,
    `address` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `tags` JSON NULL,
    `userId` VARCHAR(191) NULL,
    `source` ENUM('MANUAL', 'MAIL', 'IMPORT') NOT NULL DEFAULT 'MANUAL',
    `lastContactAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Contact_email_idx`(`email`),
    INDEX `Contact_createdById_shared_idx`(`createdById`, `shared`),
    FULLTEXT INDEX `Contact_firstName_lastName_email_company_idx`(`firstName`, `lastName`, `email`, `company`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Announcement_pinned_publishedAt_idx`(`pinned`, `publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnnouncementRead` (
    `announcementId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `readAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`announcementId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Note` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NULL,
    `body` TEXT NOT NULL,
    `color` VARCHAR(20) NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Note_userId_pinned_idx`(`userId`, `pinned`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Poll` (
    `id` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NULL,
    `question` VARCHAR(300) NOT NULL,
    `multiple` BOOLEAN NOT NULL DEFAULT false,
    `anonymous` BOOLEAN NOT NULL DEFAULT false,
    `closesAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PollOption` (
    `id` VARCHAR(191) NOT NULL,
    `pollId` VARCHAR(191) NOT NULL,
    `text` VARCHAR(200) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PollVote` (
    `optionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`optionId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('VACATION', 'SICK', 'REMOTE', 'OTHER') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `note` VARCHAR(500) NULL,
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeaveRequest_userId_startsAt_idx`(`userId`, `startsAt`),
    INDEX `LeaveRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MailAccount` ADD CONSTRAINT `MailAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailFolder` ADD CONSTRAINT `MailFolder_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MailAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailMessage` ADD CONSTRAINT `MailMessage_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MailAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailMessage` ADD CONSTRAINT `MailMessage_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `MailFolder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailMessage` ADD CONSTRAINT `MailMessage_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailAttachment` ADD CONSTRAINT `MailAttachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `MailMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailLabel` ADD CONSTRAINT `MailLabel_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailMessageLabel` ADD CONSTRAINT `MailMessageLabel_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `MailMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailMessageLabel` ADD CONSTRAINT `MailMessageLabel_labelId_fkey` FOREIGN KEY (`labelId`) REFERENCES `MailLabel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailRule` ADD CONSTRAINT `MailRule_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailRule` ADD CONSTRAINT `MailRule_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MailAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailTemplate` ADD CONSTRAINT `MailTemplate_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatChannel` ADD CONSTRAINT `ChatChannel_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatChannel` ADD CONSTRAINT `ChatChannel_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMember` ADD CONSTRAINT `ChatMember_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `ChatChannel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMember` ADD CONSTRAINT `ChatMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `ChatChannel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `ChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatAttachment` ADD CONSTRAINT `ChatAttachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatReaction` ADD CONSTRAINT `ChatReaction_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatReaction` ADD CONSTRAINT `ChatReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarEvent` ADD CONSTRAINT `CalendarEvent_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarEvent` ADD CONSTRAINT `CalendarEvent_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarAttendee` ADD CONSTRAINT `CalendarAttendee_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `CalendarEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarAttendee` ADD CONSTRAINT `CalendarAttendee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnnouncementRead` ADD CONSTRAINT `AnnouncementRead_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnnouncementRead` ADD CONSTRAINT `AnnouncementRead_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Note` ADD CONSTRAINT `Note_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Poll` ADD CONSTRAINT `Poll_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Poll` ADD CONSTRAINT `Poll_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `ChatChannel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PollOption` ADD CONSTRAINT `PollOption_pollId_fkey` FOREIGN KEY (`pollId`) REFERENCES `Poll`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PollVote` ADD CONSTRAINT `PollVote_optionId_fkey` FOREIGN KEY (`optionId`) REFERENCES `PollOption`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PollVote` ADD CONSTRAINT `PollVote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE `Contract` ADD COLUMN `signatureRequestId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `SignatureRequest` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `caseId` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'SENT', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'DRAFT',
    `order` ENUM('SEQUENTIAL', 'PARALLEL') NOT NULL DEFAULT 'SEQUENTIAL',
    `isCaseContract` BOOLEAN NOT NULL DEFAULT false,
    `originalName` VARCHAR(255) NOT NULL,
    `originalKey` VARCHAR(191) NOT NULL,
    `originalSha256` CHAR(64) NOT NULL,
    `originalSize` INTEGER NOT NULL,
    `originalPages` INTEGER NOT NULL,
    `finalKey` VARCHAR(191) NULL,
    `finalSha256` CHAR(64) NULL,
    `finalSize` INTEGER NULL,
    `finalDocumentId` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `expiresAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SignatureRequest_originalKey_key`(`originalKey`),
    UNIQUE INDEX `SignatureRequest_finalKey_key`(`finalKey`),
    INDEX `SignatureRequest_status_expiresAt_idx`(`status`, `expiresAt`),
    INDEX `SignatureRequest_caseId_idx`(`caseId`),
    INDEX `SignatureRequest_companyId_idx`(`companyId`),
    INDEX `SignatureRequest_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SignatureSigner` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `role` ENUM('CANDIDATE', 'COMPANY', 'STAFF', 'OTHER') NOT NULL,
    `userId` VARCHAR(191) NULL,
    `name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `locale` ENUM('az', 'de', 'en', 'ru') NOT NULL DEFAULT 'az',
    `order` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('PENDING', 'VIEWED', 'SIGNED', 'DECLINED') NOT NULL DEFAULT 'PENDING',
    `tokenHash` CHAR(64) NULL,
    `invitedAt` DATETIME(3) NULL,
    `viewedAt` DATETIME(3) NULL,
    `signedAt` DATETIME(3) NULL,
    `declinedAt` DATETIME(3) NULL,
    `declinedReason` TEXT NULL,
    `signatureMode` VARCHAR(8) NULL,
    `signatureImageKey` VARCHAR(191) NULL,
    `typedName` VARCHAR(160) NULL,
    `authMethod` VARCHAR(16) NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` TEXT NULL,
    `otpHash` CHAR(64) NULL,
    `otpExpiresAt` DATETIME(3) NULL,
    `otpAttempts` INTEGER NOT NULL DEFAULT 0,
    `otpSentAt` DATETIME(3) NULL,
    `otpWindowAt` DATETIME(3) NULL,
    `otpWindowCount` INTEGER NOT NULL DEFAULT 0,
    `otpVerifiedAt` DATETIME(3) NULL,
    `sessionHash` CHAR(64) NULL,
    `sessionExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SignatureSigner_tokenHash_key`(`tokenHash`),
    INDEX `SignatureSigner_requestId_order_idx`(`requestId`, `order`),
    INDEX `SignatureSigner_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SignatureEvent` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `signerId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `type` ENUM('CREATED', 'SENT', 'VIEWED', 'OTP_SENT', 'OTP_VERIFIED', 'SIGNED', 'DECLINED', 'REMINDED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DOWNLOADED') NOT NULL,
    `note` TEXT NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` TEXT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SignatureEvent_requestId_at_idx`(`requestId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SignatureRequest` ADD CONSTRAINT `SignatureRequest_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SignatureRequest` ADD CONSTRAINT `SignatureRequest_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SignatureRequest` ADD CONSTRAINT `SignatureRequest_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SignatureSigner` ADD CONSTRAINT `SignatureSigner_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `SignatureRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SignatureSigner` ADD CONSTRAINT `SignatureSigner_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SignatureEvent` ADD CONSTRAINT `SignatureEvent_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `SignatureRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SignatureEvent` ADD CONSTRAINT `SignatureEvent_signerId_fkey` FOREIGN KEY (`signerId`) REFERENCES `SignatureSigner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

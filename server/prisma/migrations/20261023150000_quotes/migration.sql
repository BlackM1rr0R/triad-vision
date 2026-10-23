-- CreateTable
CREATE TABLE `Quote` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(32) NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `vacancyId` VARCHAR(191) NULL,
    `contactName` VARCHAR(160) NULL,
    `contactEmail` VARCHAR(200) NULL,
    `locale` VARCHAR(2) NOT NULL DEFAULT 'de',
    `title` VARCHAR(200) NOT NULL,
    `salutation` VARCHAR(200) NULL,
    `introText` TEXT NULL,
    `closingText` TEXT NULL,
    `items` JSON NOT NULL,
    `discountType` ENUM('NONE', 'PERCENT', 'AMOUNT') NOT NULL DEFAULT 'NONE',
    `discountValue` INTEGER NOT NULL DEFAULT 0,
    `vatRate` INTEGER NOT NULL DEFAULT 19,
    `subtotalCents` INTEGER NOT NULL DEFAULT 0,
    `discountCents` INTEGER NOT NULL DEFAULT 0,
    `netCents` INTEGER NOT NULL DEFAULT 0,
    `vatCents` INTEGER NOT NULL DEFAULT 0,
    `grossCents` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `validUntil` DATETIME(3) NOT NULL,
    `paymentTerms` TEXT NULL,
    `deliveryTerms` TEXT NULL,
    `status` ENUM('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED') NOT NULL DEFAULT 'DRAFT',
    `tokenHash` CHAR(64) NULL,
    `tokenSealed` VARCHAR(255) NULL,
    `sentAt` DATETIME(3) NULL,
    `viewedAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `acceptedByName` VARCHAR(160) NULL,
    `acceptedIp` VARCHAR(64) NULL,
    `acceptedUa` VARCHAR(1000) NULL,
    `declinedAt` DATETIME(3) NULL,
    `declinedReason` TEXT NULL,
    `expiredAt` DATETIME(3) NULL,
    `convertedAt` DATETIME(3) NULL,
    `invoiceId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Quote_number_key`(`number`),
    UNIQUE INDEX `Quote_tokenHash_key`(`tokenHash`),
    INDEX `Quote_companyId_status_idx`(`companyId`, `status`),
    INDEX `Quote_status_validUntil_idx`(`status`, `validUntil`),
    INDEX `Quote_invoiceId_idx`(`invoiceId`),
    INDEX `Quote_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuoteEvent` (
    `id` VARCHAR(191) NOT NULL,
    `quoteId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorName` VARCHAR(160) NULL,
    `note` TEXT NULL,
    `meta` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `QuoteEvent_quoteId_createdAt_idx`(`quoteId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteEvent` ADD CONSTRAINT `QuoteEvent_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `Quote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

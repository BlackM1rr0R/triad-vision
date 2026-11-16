-- AVV (Auftragsverarbeitungsvertrag, Art. 28 DSGVO) between employers and Triad Vision: company data, e-signature
-- request and status (lib/avv). Plain ids, no foreign keys. Template approval / trust centre settings live in Setting.

-- CreateTable
CREATE TABLE `AvvAgreement` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(40) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    `templateVersion` VARCHAR(40) NOT NULL,
    `data` JSON NOT NULL,
    `signatureRequestId` VARCHAR(40) NULL,
    `pdfSha256` CHAR(64) NULL,
    `createdById` VARCHAR(40) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AvvAgreement_signatureRequestId_key`(`signatureRequestId`),
    INDEX `AvvAgreement_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `AvvAgreement_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

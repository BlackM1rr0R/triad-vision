-- AlterTable
ALTER TABLE `Document` ADD COLUMN `photoCheck` JSON NULL;

-- CreateTable
CREATE TABLE `OfficialFormTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `fileKey` VARCHAR(300) NOT NULL,
    `fieldMap` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OfficialFormTemplate_key_active_idx`(`key`, `active`),
    UNIQUE INDEX `OfficialFormTemplate_key_version_key`(`key`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OfficialFormFill` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(40) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `companyId` VARCHAR(40) NULL,
    `values` JSON NOT NULL,
    `missing` JSON NULL,
    `fileKey` VARCHAR(300) NULL,
    `driveNodeId` VARCHAR(40) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    `signatureRequestId` VARCHAR(40) NULL,
    `generatedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OfficialFormFill_caseId_idx`(`caseId`),
    INDEX `OfficialFormFill_companyId_status_idx`(`companyId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientInvoice` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `clientId` VARCHAR(40) NOT NULL,
    `caseId` VARCHAR(40) NULL,
    `issueDate` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `items` JSON NOT NULL,
    `netCents` INTEGER NOT NULL,
    `vatRate` INTEGER NOT NULL DEFAULT 19,
    `vatCents` INTEGER NOT NULL,
    `grossCents` INTEGER NOT NULL,
    `paidCents` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    `sentAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `planId` VARCHAR(40) NULL,
    `installmentId` VARCHAR(40) NULL,
    `orderId` VARCHAR(40) NULL,
    `remindedAt` DATETIME(3) NULL,
    `reminderCount` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ClientInvoice_number_key`(`number`),
    INDEX `ClientInvoice_clientId_idx`(`clientId`),
    INDEX `ClientInvoice_caseId_idx`(`caseId`),
    INDEX `ClientInvoice_status_dueDate_idx`(`status`, `dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientPayment` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(40) NOT NULL,
    `invoiceId` VARCHAR(40) NULL,
    `caseId` VARCHAR(40) NULL,
    `amountCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `method` VARCHAR(12) NOT NULL,
    `paidAt` DATETIME(3) NOT NULL,
    `reference` VARCHAR(120) NULL,
    `note` VARCHAR(500) NULL,
    `recordedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClientPayment_clientId_paidAt_idx`(`clientId`, `paidAt`),
    INDEX `ClientPayment_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentPlan` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(40) NOT NULL,
    `caseId` VARCHAR(40) NULL,
    `title` VARCHAR(200) NOT NULL,
    `totalCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `status` VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
    `orderId` VARCHAR(40) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentPlan_clientId_idx`(`clientId`),
    INDEX `PaymentPlan_caseId_idx`(`caseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentInstallment` (
    `id` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(40) NOT NULL,
    `seq` INTEGER NOT NULL,
    `label` VARCHAR(160) NULL,
    `trigger` VARCHAR(40) NULL,
    `dueDate` DATETIME(3) NULL,
    `amountCents` INTEGER NOT NULL,
    `invoiceId` VARCHAR(40) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentInstallment_status_dueDate_idx`(`status`, `dueDate`),
    UNIQUE INDEX `PaymentInstallment_planId_seq_key`(`planId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServicePackage` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `tier` VARCHAR(12) NOT NULL,
    `visaTypes` JSON NULL,
    `title` JSON NOT NULL,
    `summary` JSON NOT NULL,
    `features` JSON NOT NULL,
    `priceCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `installments` JSON NULL,
    `contractTemplateId` VARCHAR(40) NULL,
    `highlight` BOOLEAN NOT NULL DEFAULT false,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ServicePackage_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PackageOrder` (
    `id` VARCHAR(191) NOT NULL,
    `packageId` VARCHAR(40) NOT NULL,
    `clientId` VARCHAR(40) NULL,
    `email` VARCHAR(190) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'az',
    `visaType` VARCHAR(30) NULL,
    `priceCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `status` VARCHAR(12) NOT NULL DEFAULT 'STARTED',
    `signatureRequestId` VARCHAR(40) NULL,
    `caseId` VARCHAR(40) NULL,
    `planId` VARCHAR(40) NULL,
    `tokenHash` CHAR(64) NULL,
    `inquiryId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PackageOrder_tokenHash_key`(`tokenHash`),
    INDEX `PackageOrder_status_idx`(`status`),
    INDEX `PackageOrder_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployerReport` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(40) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `fileKey` VARCHAR(300) NULL,
    `stats` JSON NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmployerReport_companyId_month_key`(`companyId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


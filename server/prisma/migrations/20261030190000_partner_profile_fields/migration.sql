-- Partner profile: type, company, contacts, address, tax id, bank details (ADMIN+), contract dates,
-- language, website, tags, values of admin-defined fields and the partner's own extra fields.

-- AlterTable
ALTER TABLE `ReferralPartner` ADD COLUMN `partnerType` VARCHAR(12) NOT NULL DEFAULT 'INDIVIDUAL',
    ADD COLUMN `companyName` VARCHAR(160) NULL,
    ADD COLUMN `contactPerson` VARCHAR(120) NULL,
    ADD COLUMN `phone2` VARCHAR(40) NULL,
    ADD COLUMN `whatsapp` VARCHAR(40) NULL,
    ADD COLUMN `address` VARCHAR(255) NULL,
    ADD COLUMN `city` VARCHAR(120) NULL,
    ADD COLUMN `country` VARCHAR(80) NULL,
    ADD COLUMN `taxId` VARCHAR(40) NULL,
    ADD COLUMN `bankName` VARCHAR(120) NULL,
    ADD COLUMN `bankAccountHolder` VARCHAR(120) NULL,
    ADD COLUMN `iban` VARCHAR(42) NULL,
    ADD COLUMN `bic` VARCHAR(11) NULL,
    ADD COLUMN `contractStart` DATE NULL,
    ADD COLUMN `contractEnd` DATE NULL,
    ADD COLUMN `preferredLanguage` VARCHAR(5) NULL,
    ADD COLUMN `website` VARCHAR(255) NULL,
    ADD COLUMN `tags` JSON NULL,
    ADD COLUMN `customData` JSON NULL,
    ADD COLUMN `extraFields` JSON NULL;

-- CreateTable
CREATE TABLE `PartnerFieldDef` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `type` VARCHAR(12) NOT NULL DEFAULT 'TEXT',
    `options` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

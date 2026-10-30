-- Partner-owned clients: personal sign-up code, commission trigger and portal visibility per partner,
-- the owning partner on the user, ownership history, partner attribution of inquiries and bookings.

-- AlterTable
ALTER TABLE `ReferralPartner` ADD COLUMN `code` VARCHAR(32) NULL,
    ADD COLUMN `commissionTrigger` VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
    ADD COLUMN `visibility` VARCHAR(12) NOT NULL DEFAULT 'MINIMAL';

-- CreateIndex
CREATE UNIQUE INDEX `ReferralPartner_code_key` ON `ReferralPartner`(`code`);

-- AlterTable
ALTER TABLE `User` ADD COLUMN `ownerPartnerId` VARCHAR(191) NULL,
    ADD COLUMN `ownerPartnerAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `User_ownerPartnerId_idx` ON `User`(`ownerPartnerId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_ownerPartnerId_fkey` FOREIGN KEY (`ownerPartnerId`) REFERENCES `ReferralPartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `PartnerClientChange` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `fromPartnerId` VARCHAR(40) NULL,
    `toPartnerId` VARCHAR(40) NULL,
    `source` VARCHAR(24) NOT NULL,
    `actorId` VARCHAR(40) NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerClientChange_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `PartnerClientChange_toPartnerId_idx`(`toPartnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Inquiry` ADD COLUMN `partnerId` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `Booking` ADD COLUMN `partnerId` VARCHAR(40) NULL;

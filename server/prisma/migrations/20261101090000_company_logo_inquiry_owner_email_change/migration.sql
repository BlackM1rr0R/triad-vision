-- AlterTable
ALTER TABLE `Company` ADD COLUMN `logo` JSON NULL;

-- AlterTable
ALTER TABLE `EmailVerificationToken` ADD COLUMN `newEmail` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Inquiry` ADD COLUMN `agentId` VARCHAR(40) NULL,
    ADD COLUMN `anonymizedAt` DATETIME(3) NULL,
    ADD COLUMN `assignedAt` DATETIME(3) NULL,
    ADD COLUMN `assignedStaffId` VARCHAR(40) NULL,
    ADD COLUMN `convertedAt` DATETIME(3) NULL,
    ADD COLUMN `convertedCompanyId` VARCHAR(40) NULL,
    ADD COLUMN `convertedUserId` VARCHAR(40) NULL,
    ADD COLUMN `staffNotes` TEXT NULL;

-- CreateIndex
CREATE INDEX `Inquiry_assignedStaffId_idx` ON `Inquiry`(`assignedStaffId`);

-- CreateIndex
CREATE INDEX `Inquiry_agentId_idx` ON `Inquiry`(`agentId`);


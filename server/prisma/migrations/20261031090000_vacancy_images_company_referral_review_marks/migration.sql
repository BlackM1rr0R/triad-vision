-- AlterTable
ALTER TABLE `Company` ADD COLUMN `referralCode` VARCHAR(40) NULL,
    ADD COLUMN `referredAt` DATETIME(3) NULL,
    ADD COLUMN `referredByAgentId` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `Document` ADD COLUMN `reviewMarks` JSON NULL;

-- AlterTable
ALTER TABLE `Vacancy` ADD COLUMN `images` JSON NULL;


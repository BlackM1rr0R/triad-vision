-- AlterTable
ALTER TABLE `Case` ADD COLUMN `residenceTitleKind` ENUM('RESIDENCE_PERMIT', 'EU_BLUE_CARD') NULL,
    ADD COLUMN `healthInsuranceExpiresAt` DATETIME(3) NULL;

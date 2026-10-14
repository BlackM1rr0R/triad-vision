-- AlterTable
ALTER TABLE `Partner` ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `description` JSON NULL,
    ADD COLUMN `featured` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sector` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Service` ADD COLUMN `duration` JSON NULL,
    ADD COLUMN `steps` JSON NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `about` TEXT NULL,
    ADD COLUMN `address` TEXT NULL,
    ADD COLUMN `birthDate` DATETIME(3) NULL,
    ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `drivingLicence` VARCHAR(191) NULL,
    ADD COLUMN `education` VARCHAR(191) NULL,
    ADD COLUMN `emailNotifications` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `experienceYears` INTEGER NULL,
    ADD COLUMN `germanLevel` VARCHAR(191) NULL,
    ADD COLUMN `nationality` VARCHAR(191) NULL,
    ADD COLUMN `profession` VARCHAR(191) NULL,
    ADD COLUMN `pushNotifications` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `VisaCategory` ADD COLUMN `documents` JSON NULL,
    ADD COLUMN `familyReunion` BOOLEAN NULL,
    ADD COLUMN `faq` JSON NULL,
    ADD COLUMN `germanLevel` VARCHAR(191) NULL,
    ADD COLUMN `processingMax` INTEGER NULL,
    ADD COLUMN `processingMin` INTEGER NULL,
    ADD COLUMN `requirements` JSON NULL,
    ADD COLUMN `salaryMax` INTEGER NULL,
    ADD COLUMN `salaryMin` INTEGER NULL;

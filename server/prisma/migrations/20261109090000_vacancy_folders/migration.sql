-- AlterTable
ALTER TABLE `Case` ADD COLUMN `driveParentId` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `Vacancy` ADD COLUMN `driveFolderId` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `VacancyApplication` ADD COLUMN `targetFolderId` VARCHAR(40) NULL,
    ADD COLUMN `driveFolderId` VARCHAR(40) NULL;

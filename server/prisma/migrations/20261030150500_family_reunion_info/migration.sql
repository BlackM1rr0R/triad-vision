-- CreateTable
CREATE TABLE `FamilyReunionInfo` (
    `id` VARCHAR(191) NOT NULL,
    `mainCaseId` VARCHAR(191) NOT NULL,
    `sponsorTitle` VARCHAR(20) NULL,
    `titleIssuedAt` DATETIME(3) NULL,
    `livingSpaceM2` INTEGER NULL,
    `warmRent` INTEGER NULL,
    `netMonthly` INTEGER NULL,
    `notes` TEXT NULL,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FamilyReunionInfo_mainCaseId_key`(`mainCaseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FamilyReunionInfo` ADD CONSTRAINT `FamilyReunionInfo_mainCaseId_fkey` FOREIGN KEY (`mainCaseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

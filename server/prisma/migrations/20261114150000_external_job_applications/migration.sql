-- "Apply via Triad Vision" for vacancies listed on other job sites (Adzuna results on /jobs/germany, pasted links):
-- the listing, the candidate's details and CV next to the Inquiry lead.
CREATE TABLE `ExternalJobApplication` (
    `id` VARCHAR(191) NOT NULL,
    `inquiryId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `externalId` VARCHAR(64) NULL,
    `listingUrl` VARCHAR(1000) NOT NULL,
    `listingTitle` VARCHAR(300) NULL,
    `listingCompany` VARCHAR(200) NULL,
    `listingLocation` VARCHAR(200) NULL,
    `jobType` VARCHAR(20) NULL,
    `germanLevel` VARCHAR(10) NULL,
    `profession` VARCHAR(160) NULL,
    `experienceYears` INTEGER NULL,
    `userId` VARCHAR(40) NULL,
    `cvStoredName` VARCHAR(120) NULL,
    `cvOriginalName` VARCHAR(255) NULL,
    `cvMime` VARCHAR(120) NULL,
    `cvSize` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExternalJobApplication_inquiryId_key`(`inquiryId`),
    INDEX `ExternalJobApplication_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ExternalJobApplication` ADD CONSTRAINT `ExternalJobApplication_inquiryId_fkey` FOREIGN KEY (`inquiryId`) REFERENCES `Inquiry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

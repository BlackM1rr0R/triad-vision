-- "Study in Germany" programme catalogue (curated by staff, /study) and "apply via Triad Vision" details next to the Inquiry lead.
-- CreateTable
CREATE TABLE `StudyProgramme` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `university` VARCHAR(200) NOT NULL,
    `city` VARCHAR(100) NOT NULL,
    `federalState` VARCHAR(4) NOT NULL,
    `degree` VARCHAR(20) NOT NULL,
    `subjectArea` VARCHAR(40) NOT NULL,
    `name` VARCHAR(250) NOT NULL,
    `teachingLanguage` VARCHAR(8) NOT NULL,
    `languageRequirement` VARCHAR(500) NULL,
    `durationSemesters` INTEGER NOT NULL,
    `tuitionPerSemester` INTEGER NOT NULL DEFAULT 0,
    `semesterContribution` INTEGER NULL,
    `deadlines` JSON NOT NULL,
    `applicationRoute` VARCHAR(20) NOT NULL,
    `officialUrl` VARCHAR(1000) NOT NULL,
    `description` JSON NULL,
    `requirements` JSON NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `staffNote` TEXT NULL,
    `checkedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StudyProgramme_slug_key`(`slug`),
    INDEX `StudyProgramme_published_idx`(`published`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudyApplication` (
    `id` VARCHAR(191) NOT NULL,
    `inquiryId` VARCHAR(191) NOT NULL,
    `programmeId` VARCHAR(191) NULL,
    `programmeSlug` VARCHAR(120) NOT NULL,
    `programmeName` VARCHAR(250) NOT NULL,
    `university` VARCHAR(200) NOT NULL,
    `currentDegree` VARCHAR(20) NULL,
    `fieldOfStudy` VARCHAR(160) NULL,
    `gpa` VARCHAR(40) NULL,
    `languageCertificate` VARCHAR(20) NULL,
    `languageLevel` VARCHAR(40) NULL,
    `desiredIntake` VARCHAR(20) NULL,
    `userId` VARCHAR(40) NULL,
    `cvStoredName` VARCHAR(120) NULL,
    `cvOriginalName` VARCHAR(255) NULL,
    `cvMime` VARCHAR(120) NULL,
    `cvSize` INTEGER NULL,
    `diplomaStoredName` VARCHAR(120) NULL,
    `diplomaOriginalName` VARCHAR(255) NULL,
    `diplomaMime` VARCHAR(120) NULL,
    `diplomaSize` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StudyApplication_inquiryId_key`(`inquiryId`),
    INDEX `StudyApplication_userId_idx`(`userId`),
    INDEX `StudyApplication_programmeId_idx`(`programmeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StudyApplication` ADD CONSTRAINT `StudyApplication_inquiryId_fkey` FOREIGN KEY (`inquiryId`) REFERENCES `Inquiry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudyApplication` ADD CONSTRAINT `StudyApplication_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `StudyProgramme`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


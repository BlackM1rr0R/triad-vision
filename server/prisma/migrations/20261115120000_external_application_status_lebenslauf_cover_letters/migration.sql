-- "Apply via Triad Vision": status timeline visible to the client, Anschreiben attached by staff, Lebenslauf snapshot link.
ALTER TABLE `ExternalJobApplication`
    ADD COLUMN `lebenslaufVersionId` VARCHAR(40) NULL,
    ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
    ADD COLUMN `statusNote` VARCHAR(1000) NULL,
    ADD COLUMN `statusChangedAt` DATETIME(3) NULL,
    ADD COLUMN `coverLetterSubject` VARCHAR(300) NULL,
    ADD COLUMN `coverLetterBody` TEXT NULL,
    ADD COLUMN `coverLetterAt` DATETIME(3) NULL;

CREATE TABLE `ExternalJobApplicationEvent` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `note` VARCHAR(1000) NULL,
    `staffId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExternalJobApplicationEvent_applicationId_createdAt_idx`(`applicationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Generated German CVs (tabellarischer Lebenslauf), versioned per client.
CREATE TABLE `LebenslaufVersion` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `storageKey` VARCHAR(120) NOT NULL,
    `size` INTEGER NOT NULL,
    `lang` VARCHAR(5) NOT NULL DEFAULT 'de',
    `withPhoto` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LebenslaufVersion_userId_version_key`(`userId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Anschreiben templates per job type (admin-managed; built-in defaults in code).
CREATE TABLE `CoverLetterTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `jobType` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `subject` VARCHAR(300) NOT NULL,
    `body` TEXT NOT NULL,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CoverLetterTemplate_jobType_key`(`jobType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ExternalJobApplicationEvent` ADD CONSTRAINT `ExternalJobApplicationEvent_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `ExternalJobApplication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LebenslaufVersion` ADD CONSTRAINT `LebenslaufVersion_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

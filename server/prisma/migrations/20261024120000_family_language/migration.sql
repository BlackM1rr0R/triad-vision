-- CreateTable
CREATE TABLE `FamilyMember` (
    `id` VARCHAR(191) NOT NULL,
    `mainCaseId` VARCHAR(191) NOT NULL,
    `memberCaseId` VARCHAR(191) NOT NULL,
    `relation` ENUM('SPOUSE', 'CHILD', 'PARENT', 'OTHER') NOT NULL,
    `firstName` VARCHAR(80) NOT NULL,
    `lastName` VARCHAR(80) NOT NULL,
    `birthDate` DATETIME(3) NULL,
    `birthPlace` VARCHAR(120) NULL,
    `sex` VARCHAR(1) NULL,
    `nationality` VARCHAR(60) NULL,
    `passportNumber` VARCHAR(40) NULL,
    `passportIssuedAt` DATETIME(3) NULL,
    `passportExpiresAt` DATETIME(3) NULL,
    `email` VARCHAR(190) NULL,
    `joinsWhen` ENUM('WITH_MAIN', 'LATER') NOT NULL DEFAULT 'WITH_MAIN',
    `plannedEntryAt` DATETIME(3) NULL,
    `germanExempt` BOOLEAN NOT NULL DEFAULT false,
    `germanExemptNote` VARCHAR(300) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FamilyMember_memberCaseId_key`(`memberCaseId`),
    INDEX `FamilyMember_mainCaseId_idx`(`mainCaseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GermanPlan` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `targetLevel` VARCHAR(4) NULL,
    `targetDate` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GermanPlan_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GermanCourse` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `school` VARCHAR(160) NOT NULL,
    `level` VARCHAR(4) NOT NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `schedule` VARCHAR(200) NULL,
    `format` VARCHAR(10) NULL,
    `status` ENUM('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `catalogCourseId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GermanCourse_userId_idx`(`userId`),
    INDEX `GermanCourse_startsAt_idx`(`startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GermanExamDate` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('GOETHE', 'TELC', 'OESD', 'TESTDAF', 'OTHER') NOT NULL,
    `level` VARCHAR(4) NULL,
    `city` VARCHAR(80) NOT NULL DEFAULT 'Baku',
    `location` VARCHAR(200) NULL,
    `examDate` DATETIME(3) NOT NULL,
    `registrationDeadline` DATETIME(3) NULL,
    `link` TEXT NULL,
    `notes` VARCHAR(500) NULL,
    `published` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GermanExamDate_examDate_idx`(`examDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GermanExam` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` ENUM('GOETHE', 'TELC', 'OESD', 'TESTDAF', 'OTHER') NOT NULL,
    `level` VARCHAR(4) NOT NULL,
    `examDateId` VARCHAR(191) NULL,
    `examDate` DATETIME(3) NULL,
    `location` VARCHAR(200) NULL,
    `registrationDeadline` DATETIME(3) NULL,
    `registeredAt` DATETIME(3) NULL,
    `status` ENUM('PLANNED', 'REGISTERED', 'TAKEN', 'PASSED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `results` JSON NULL,
    `passed` BOOLEAN NULL,
    `certificateDocumentId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GermanExam_userId_idx`(`userId`),
    INDEX `GermanExam_examDate_idx`(`examDate`),
    INDEX `GermanExam_registrationDeadline_idx`(`registrationDeadline`),
    INDEX `GermanExam_certificateDocumentId_idx`(`certificateDocumentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FamilyMember` ADD CONSTRAINT `FamilyMember_mainCaseId_fkey` FOREIGN KEY (`mainCaseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FamilyMember` ADD CONSTRAINT `FamilyMember_memberCaseId_fkey` FOREIGN KEY (`memberCaseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GermanPlan` ADD CONSTRAINT `GermanPlan_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GermanCourse` ADD CONSTRAINT `GermanCourse_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GermanExam` ADD CONSTRAINT `GermanExam_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GermanExam` ADD CONSTRAINT `GermanExam_examDateId_fkey` FOREIGN KEY (`examDateId`) REFERENCES `GermanExamDate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


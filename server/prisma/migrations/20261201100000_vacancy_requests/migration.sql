-- "Vakansiya sorğusu" (lib/vacancyRequests): requests for a kind of job (WORK / AUSBILDUNG) from guests and clients, handled
-- in admin › Vacancies › Sorğular. VacancyRequestNotice records each vacancy a request was told about (never twice).

-- CreateTable
CREATE TABLE `VacancyRequest` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(12) NOT NULL,
    `sector` VARCHAR(30) NULL,
    `profession` VARCHAR(120) NULL,
    `city` VARCHAR(80) NULL,
    `germanLevel` VARCHAR(4) NULL,
    `note` TEXT NULL,
    `status` ENUM('NEW', 'IN_PROGRESS', 'OFFERED', 'CLOSED') NOT NULL DEFAULT 'NEW',
    `userId` VARCHAR(40) NULL,
    `contactName` VARCHAR(120) NULL,
    `email` VARCHAR(190) NULL,
    `phone` VARCHAR(40) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'az',
    `sourceVacancyId` VARCHAR(40) NULL,
    `inquiryId` VARCHAR(40) NULL,
    `assignedStaffId` VARCHAR(40) NULL,
    `staffNote` TEXT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `lastOfferedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VacancyRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `VacancyRequest_userId_idx`(`userId`),
    INDEX `VacancyRequest_email_idx`(`email`),
    INDEX `VacancyRequest_type_sector_idx`(`type`, `sector`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VacancyRequestNotice` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `vacancyId` VARCHAR(40) NOT NULL,
    `source` VARCHAR(8) NOT NULL,
    `staffId` VARCHAR(40) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VacancyRequestNotice_vacancyId_idx`(`vacancyId`),
    UNIQUE INDEX `VacancyRequestNotice_requestId_vacancyId_key`(`requestId`, `vacancyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VacancyRequestNotice` ADD CONSTRAINT `VacancyRequestNotice_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `VacancyRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

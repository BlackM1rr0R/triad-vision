-- Client process: office visits on the booking module (slot kind / location / seats, booking → case),
-- client tasks with deadlines.

-- AlterTable
ALTER TABLE `ConsultationSlot` ADD COLUMN `kind` ENUM('ONLINE', 'OFFICE') NOT NULL DEFAULT 'ONLINE',
    ADD COLUMN `location` TEXT NULL,
    ADD COLUMN `seat` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex (before dropping the old one: it also serves the staffId foreign key)
CREATE UNIQUE INDEX `ConsultationSlot_staffId_startsAt_seat_key` ON `ConsultationSlot`(`staffId`, `startsAt`, `seat`);

-- DropIndex
DROP INDEX `ConsultationSlot_staffId_startsAt_key` ON `ConsultationSlot`;

-- CreateIndex
CREATE INDEX `ConsultationSlot_kind_startsAt_idx` ON `ConsultationSlot`(`kind`, `startsAt`);

-- AlterTable
ALTER TABLE `Booking` ADD COLUMN `caseId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Booking_caseId_idx` ON `Booking`(`caseId`);

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `ClientTask` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `template` VARCHAR(40) NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `dueAt` DATETIME(3) NULL,
    `status` ENUM('OPEN', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `requirementId` VARCHAR(191) NULL,
    `linkUrl` TEXT NULL,
    `attachmentId` VARCHAR(40) NULL,
    `clientDocumentId` VARCHAR(40) NULL,
    `clientNote` TEXT NULL,
    `completedVia` VARCHAR(12) NULL,
    `completedAt` DATETIME(3) NULL,
    `completedById` VARCHAR(40) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClientTask_caseId_status_idx`(`caseId`, `status`),
    INDEX `ClientTask_status_dueAt_idx`(`status`, `dueAt`),
    INDEX `ClientTask_requirementId_idx`(`requirementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClientTask` ADD CONSTRAINT `ClientTask_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientTask` ADD CONSTRAINT `ClientTask_requirementId_fkey` FOREIGN KEY (`requirementId`) REFERENCES `DocumentRequirement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientTask` ADD CONSTRAINT `ClientTask_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

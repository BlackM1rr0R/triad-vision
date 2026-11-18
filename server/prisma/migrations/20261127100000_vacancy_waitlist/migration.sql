-- Vacancy waitlist ("Uyğun vakansiya açılanda xəbər ver", lib/jobAlerts/waitlist.ts): job alerts with waitlist = true hold one
-- profession, an optional city / region and the visitor's lead (Inquiry id). JobAlertNotice records every vacancy a person
-- (user id or e-mail) was told about, so nobody is notified twice for the same vacancy; rows go with the alert.

-- AlterTable
ALTER TABLE `JobAlert` ADD COLUMN `waitlist` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `city` VARCHAR(80) NULL,
    ADD COLUMN `inquiryId` VARCHAR(40) NULL;

-- CreateIndex
CREATE INDEX `JobAlert_waitlist_confirmedAt_idx` ON `JobAlert`(`waitlist`, `confirmedAt`);

-- CreateTable
CREATE TABLE `JobAlertNotice` (
    `id` VARCHAR(191) NOT NULL,
    `alertId` VARCHAR(191) NOT NULL,
    `vacancyId` VARCHAR(40) NOT NULL,
    `recipient` VARCHAR(190) NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `JobAlertNotice_alertId_idx`(`alertId`),
    INDEX `JobAlertNotice_vacancyId_idx`(`vacancyId`),
    UNIQUE INDEX `JobAlertNotice_recipient_vacancyId_key`(`recipient`, `vacancyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `JobAlertNotice` ADD CONSTRAINT `JobAlertNotice_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `JobAlert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

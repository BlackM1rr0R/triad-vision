-- Germany readiness score (snapshots for the trend line, money self-check) and admin-editable employer arrival
-- checklist templates with due dates relative to the arrival / first work day (plain ids, no foreign keys).

-- AlterTable
ALTER TABLE `EmployerArrivalItem` ADD COLUMN `dueAuto` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `ReadinessSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `day` DATE NOT NULL,
    `score` INTEGER NOT NULL,
    `parts` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ReadinessSnapshot_userId_day_key`(`userId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReadinessSelfCheck` (
    `userId` VARCHAR(40) NOT NULL,
    `answers` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployerChecklistTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(30) NOT NULL,
    `labelDe` VARCHAR(200) NOT NULL,
    `labelEn` VARCHAR(200) NULL,
    `labelAz` VARCHAR(200) NULL,
    `labelRu` VARCHAR(200) NULL,
    `anchor` VARCHAR(12) NOT NULL DEFAULT 'ARRIVAL',
    `offsetDays` INTEGER NULL,
    `visibleToWorker` BOOLEAN NOT NULL DEFAULT true,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmployerChecklistTemplate_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

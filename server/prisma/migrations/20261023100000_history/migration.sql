-- CreateTable
CREATE TABLE `FieldChange` (
    `id` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(16) NOT NULL,
    `entityId` VARCHAR(40) NOT NULL,
    `field` VARCHAR(120) NOT NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NULL,
    `actorId` VARCHAR(40) NULL,
    `actorRole` VARCHAR(16) NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'system',
    `requestId` VARCHAR(64) NULL,
    `revertOfId` VARCHAR(40) NULL,
    `revertedById` VARCHAR(40) NULL,
    `revertedAt` DATETIME(3) NULL,
    `sensitive` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FieldChange_entity_entityId_createdAt_idx`(`entity`, `entityId`, `createdAt`),
    INDEX `FieldChange_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `FieldChange_requestId_idx`(`requestId`),
    INDEX `FieldChange_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

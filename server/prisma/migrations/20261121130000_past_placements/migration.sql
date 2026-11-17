-- Past placements (lib/pastPlacements): real aggregated historical placements entered by admins, added to the public placement map.

-- CreateTable
CREATE TABLE `PastPlacement` (
    `id` VARCHAR(191) NOT NULL,
    `city` VARCHAR(80) NOT NULL,
    `cityKey` VARCHAR(80) NOT NULL,
    `citySlug` VARCHAR(60) NULL,
    `state` VARCHAR(2) NULL,
    `profession` VARCHAR(40) NULL,
    `count` INTEGER NOT NULL,
    `year` INTEGER NULL,
    `note` VARCHAR(300) NULL,
    `createdById` VARCHAR(40) NULL,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PastPlacement_cityKey_idx`(`cityKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

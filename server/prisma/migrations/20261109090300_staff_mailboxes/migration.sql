-- CreateTable
CREATE TABLE `StaffMailbox` (
    `id` VARCHAR(191) NOT NULL,
    `address` VARCHAR(190) NOT NULL,
    `stalwartId` VARCHAR(40) NOT NULL,
    `disabledAt` DATETIME(3) NULL,
    `disabledById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffMailbox_address_key`(`address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `emailOtpEnabledAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `EmailOtpCode` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `challengeId` VARCHAR(191) NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmailOtpCode_userId_purpose_idx`(`userId`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmailOtpCode` ADD CONSTRAINT `EmailOtpCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

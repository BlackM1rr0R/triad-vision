-- "Welcome to Germany" arrival certificates (plain ids, no foreign keys).
-- CreateTable
CREATE TABLE `ArrivalCertificate` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `arrivedAt` DATETIME(3) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(40) NULL,
    `revokeReason` VARCHAR(300) NULL,

    UNIQUE INDEX `ArrivalCertificate_number_key`(`number`),
    UNIQUE INDEX `ArrivalCertificate_code_key`(`code`),
    UNIQUE INDEX `ArrivalCertificate_caseId_key`(`caseId`),
    INDEX `ArrivalCertificate_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

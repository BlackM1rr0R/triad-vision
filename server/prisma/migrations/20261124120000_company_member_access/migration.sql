-- Employer portal roles (lib/companyAccess): role + Access-Center overrides per COMPANY login.
-- No row = STANDARD (today's access), so existing logins keep exactly their current access.

-- CreateTable
CREATE TABLE `CompanyMemberAccess` (
    `userId` VARCHAR(40) NOT NULL,
    `companyId` VARCHAR(40) NOT NULL,
    `role` VARCHAR(12) NULL,
    `overrides` JSON NULL,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CompanyMemberAccess_companyId_idx`(`companyId`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

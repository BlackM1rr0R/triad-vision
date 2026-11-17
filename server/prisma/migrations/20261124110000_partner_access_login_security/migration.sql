-- Access Center: per-partner portal permissions, partner team members, login security per role / user
-- (lib/partnerAccess, lib/loginSecurity). Zero behaviour change: every partner that exists now gets a LEGACY
-- permission row (= exactly today's portal, derived from ReferralPartner.visibility); no login security row
-- exists, so 2FA / session lifetimes / contract checks stay as they are until a super admin changes them.
-- (A partner without a row is LEGACY too; only partners created in the admin panel from now on get a DEFAULT row.)

-- CreateTable
CREATE TABLE `PartnerAccess` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(40) NOT NULL,
    `template` VARCHAR(12) NOT NULL DEFAULT 'DEFAULT',
    `perms` JSON NULL,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PartnerAccess_partnerId_key`(`partnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerMember` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `perms` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `invitedById` VARCHAR(40) NULL,
    `deactivatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PartnerMember_userId_key`(`userId`),
    INDEX `PartnerMember_partnerId_idx`(`partnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoginSecurityRole` (
    `role` VARCHAR(12) NOT NULL,
    `require2fa` BOOLEAN NULL,
    `webIdleMinutes` INTEGER NULL,
    `webMaxHours` INTEGER NULL,
    `mobileIdleDays` INTEGER NULL,
    `mobileMaxDays` INTEGER NULL,
    `requireActiveContract` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(40) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`role`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoginSecurityUser` (
    `userId` VARCHAR(191) NOT NULL,
    `require2fa` BOOLEAN NULL,
    `webIdleMinutes` INTEGER NULL,
    `webMaxHours` INTEGER NULL,
    `mobileIdleDays` INTEGER NULL,
    `mobileMaxDays` INTEGER NULL,
    `note` VARCHAR(300) NULL,
    `updatedById` VARCHAR(40) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Every existing partner keeps today's portal (LEGACY = derived from its visibility setting).
INSERT INTO `PartnerAccess` (`id`, `partnerId`, `template`, `perms`, `updatedById`, `createdAt`, `updatedAt`)
SELECT CONCAT('pa_', `id`), `id`, 'LEGACY', NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `ReferralPartner`;

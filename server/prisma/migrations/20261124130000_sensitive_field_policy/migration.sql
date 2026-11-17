-- Sensitive field policy overrides per role (HIDDEN), staff role template or user (lib/privacy/sensitivePolicy.ts).
-- No rows = today's masking behaviour (Setting 'privacy.masking').

-- CreateTable
CREATE TABLE `SensitiveFieldPolicy` (
    `id` VARCHAR(191) NOT NULL,
    `maskGroup` VARCHAR(20) NOT NULL,
    `scope` VARCHAR(80) NOT NULL,
    `mode` VARCHAR(10) NOT NULL,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SensitiveFieldPolicy_scope_idx`(`scope`),
    UNIQUE INDEX `SensitiveFieldPolicy_maskGroup_scope_key`(`maskGroup`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

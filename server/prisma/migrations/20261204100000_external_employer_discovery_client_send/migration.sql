-- "Apply via Triad Vision": employer e-mail discovery (lib/germanyJobs/discovery) and the client sending the
-- prepared package themselves when no address is usable (CLIENT_SEND, lib/germanyJobs/autoSend.ts).
ALTER TABLE `ExternalJobApplication`
    ADD COLUMN `employerEmailEvidenceUrl` VARCHAR(1000) NULL,
    ADD COLUMN `employerEmailEvidence` VARCHAR(500) NULL,
    ADD COLUMN `employerPageUrl` VARCHAR(1000) NULL,
    ADD COLUMN `discoveryState` VARCHAR(20) NULL,
    ADD COLUMN `discoveryAt` DATETIME(3) NULL,
    ADD COLUMN `clientSendAt` DATETIME(3) NULL,
    ADD COLUMN `clientRemindedAt` DATETIME(3) NULL,
    ADD COLUMN `clientHelpAt` DATETIME(3) NULL;

CREATE TABLE `EmployerEmailDiscovery` (
    `id` VARCHAR(191) NOT NULL,
    `urlHash` CHAR(64) NOT NULL,
    `listingUrl` VARCHAR(1000) NOT NULL,
    `outcome` VARCHAR(20) NOT NULL,
    `pageUrl` VARCHAR(1000) NULL,
    `email` VARCHAR(190) NULL,
    `evidenceUrl` VARCHAR(1000) NULL,
    `evidence` VARCHAR(500) NULL,
    `error` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmployerEmailDiscovery_urlHash_key`(`urlHash`),
    INDEX `EmployerEmailDiscovery_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

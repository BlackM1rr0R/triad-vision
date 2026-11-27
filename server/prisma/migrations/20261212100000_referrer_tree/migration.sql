-- Referrer tree (pyramid of Baku referrers, no commissions): parent referrer, admin approval of sub-referrers created from the portal.
-- Existing partners stay top level and APPROVED (no behaviour change).
ALTER TABLE `ReferralPartner`
    ADD COLUMN `parentPartnerId` VARCHAR(191) NULL,
    ADD COLUMN `approvalStatus` VARCHAR(10) NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN `createdByPartnerId` VARCHAR(40) NULL,
    ADD COLUMN `approvalDecidedAt` DATETIME(3) NULL,
    ADD COLUMN `approvalNote` VARCHAR(500) NULL;

CREATE INDEX `ReferralPartner_parentPartnerId_idx` ON `ReferralPartner`(`parentPartnerId`);
CREATE INDEX `ReferralPartner_approvalStatus_idx` ON `ReferralPartner`(`approvalStatus`);

ALTER TABLE `ReferralPartner` ADD CONSTRAINT `ReferralPartner_parentPartnerId_fkey` FOREIGN KEY (`parentPartnerId`) REFERENCES `ReferralPartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

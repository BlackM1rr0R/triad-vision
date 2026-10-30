-- Client referral programme: bonus rewards (case opened, tier, friend discount) in the same ledger.
-- AlterTable
ALTER TABLE `ReferralReward` ADD COLUMN `dedupeKey` VARCHAR(80) NULL,
    ADD COLUMN `sourceReferralId` VARCHAR(191) NULL,
    ADD COLUMN `type` VARCHAR(12) NOT NULL DEFAULT 'REFERRAL',
    MODIFY `referralId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ReferralReward_dedupeKey_key` ON `ReferralReward`(`dedupeKey`);

-- CreateIndex
CREATE INDEX `ReferralReward_sourceReferralId_idx` ON `ReferralReward`(`sourceReferralId`);

-- AddForeignKey
ALTER TABLE `ReferralReward` ADD CONSTRAINT `ReferralReward_sourceReferralId_fkey` FOREIGN KEY (`sourceReferralId`) REFERENCES `ClientReferral`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

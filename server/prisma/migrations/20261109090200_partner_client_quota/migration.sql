-- Partner client quota: how many clients the partner needs (null = no target).
ALTER TABLE `ReferralPartner` ADD COLUMN `clientQuota` INTEGER NULL;

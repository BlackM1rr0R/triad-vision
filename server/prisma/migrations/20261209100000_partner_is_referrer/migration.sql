-- Referral partners who bring clients and register them for a vacancy themselves (client folders stay in Anträge with a "Ref:" suffix). Existing partners unchanged.
ALTER TABLE `ReferralPartner` ADD COLUMN `isReferrer` BOOLEAN NOT NULL DEFAULT false;

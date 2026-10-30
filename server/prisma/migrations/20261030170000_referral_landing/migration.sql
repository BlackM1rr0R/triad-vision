-- Client referral programme: personal landing page /r/<slug> (opt-in).
-- AlterTable
ALTER TABLE `ClientReferralCode` ADD COLUMN `landingEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `landingPhotoUrl` VARCHAR(200) NULL,
    ADD COLUMN `landingQuote` VARCHAR(280) NULL,
    ADD COLUMN `slug` VARCHAR(40) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ClientReferralCode_slug_key` ON `ClientReferralCode`(`slug`);

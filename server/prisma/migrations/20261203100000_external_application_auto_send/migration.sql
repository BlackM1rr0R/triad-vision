-- "Apply via Triad Vision": automatic checks and sending to the employer (lib/germanyJobs/autoSend.ts).
ALTER TABLE `ExternalJobApplication`
    ADD COLUMN `siteLocale` VARCHAR(5) NULL,
    ADD COLUMN `forwardConsentAt` DATETIME(3) NULL,
    ADD COLUMN `requiredGerman` VARCHAR(10) NULL,
    ADD COLUMN `employerEmail` VARCHAR(190) NULL,
    ADD COLUMN `employerEmailSource` VARCHAR(20) NULL,
    ADD COLUMN `autoState` VARCHAR(20) NULL,
    ADD COLUMN `autoMissing` VARCHAR(200) NULL,
    ADD COLUMN `autoCheckedAt` DATETIME(3) NULL,
    ADD COLUMN `autoNotifiedKey` VARCHAR(200) NULL,
    ADD COLUMN `autoReason` VARCHAR(40) NULL,
    ADD COLUMN `autoNextAt` DATETIME(3) NULL,
    ADD COLUMN `autoSentAt` DATETIME(3) NULL,
    ADD COLUMN `autoSentMode` VARCHAR(10) NULL;

CREATE INDEX `ExternalJobApplication_autoState_autoNextAt_idx` ON `ExternalJobApplication`(`autoState`, `autoNextAt`);
CREATE INDEX `ExternalJobApplication_autoSentAt_idx` ON `ExternalJobApplication`(`autoSentAt`);

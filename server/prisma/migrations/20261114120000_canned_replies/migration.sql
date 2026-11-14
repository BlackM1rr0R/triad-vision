-- Canned replies for the staff message composers: plain-text body, "/" shortcut and client language on MailTemplate.
ALTER TABLE `MailTemplate` ADD COLUMN `text` TEXT NULL,
    ADD COLUMN `shortcut` VARCHAR(40) NULL,
    ADD COLUMN `lang` VARCHAR(5) NULL;

CREATE INDEX `MailTemplate_shortcut_idx` ON `MailTemplate`(`shortcut`);

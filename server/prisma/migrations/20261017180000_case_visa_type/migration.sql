-- AlterTable
ALTER TABLE `Case` ADD COLUMN `visaType` ENUM('WORK', 'AUSBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST') NOT NULL DEFAULT 'WORK';


-- Existing cases of the Ausbildung visa type become AUSBILDUNG applications.
UPDATE `Case` c JOIN `VisaCategory` v ON v.id = c.visaCategoryId SET c.visaType = 'AUSBILDUNG' WHERE v.slug = 'ausbildung';

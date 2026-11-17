-- Staff simplicity: work profiles + simple/full sidebar per staff member, and system Knowledge Base articles
-- ("What does this page do?" guides, one per admin page) that the deploy seed keeps up to date unless edited.

-- AlterTable
ALTER TABLE `StaffPreferences` ADD COLUMN `workProfile` VARCHAR(20) NULL,
    ADD COLUMN `navView` VARCHAR(10) NULL;

-- AlterTable
ALTER TABLE `KbArticle` ADD COLUMN `systemKey` VARCHAR(120) NULL,
    ADD COLUMN `systemHash` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `KbArticle_systemKey_key` ON `KbArticle`(`systemKey`);

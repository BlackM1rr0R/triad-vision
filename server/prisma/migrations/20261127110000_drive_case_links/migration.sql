-- AlterTable: case link of "İş axını" copies and the "was a client folder" mark (lib/drive/workflowLinks.ts)
ALTER TABLE `DriveNode` ADD COLUMN `workflowCaseId` VARCHAR(191) NULL,
    ADD COLUMN `clientFolderAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `DriveNode_workflowCaseId_idx` ON `DriveNode`(`workflowCaseId`);

-- Backfill (idempotent): every current client folder is marked. Workflow copies are linked by name and orphaned
-- client folders are found by the drive job (jobs/driveCaseLinks.ts, lib/drive/workflowLinks.backfillCaseLinks).
UPDATE `DriveNode` d INNER JOIN `Case` c ON c.`driveFolderId` = d.`id`
SET d.`clientFolderAt` = CURRENT_TIMESTAMP(3)
WHERE d.`clientFolderAt` IS NULL;

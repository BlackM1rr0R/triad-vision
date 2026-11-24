-- Linked case documents (lib/docLink): a file uploaded for an initial requirement is also attached to the matching
-- embassy requirement (and back) as its own copy; the copy follows the source's review unless staff reviewed it alone.
ALTER TABLE `Document`
    ADD COLUMN `linkedFromId` VARCHAR(191) NULL,
    ADD COLUMN `linkedFromStage` ENUM('INITIAL', 'EMBASSY', 'CONTRACT', 'CONTRACT_SIGNED', 'VISA', 'OTHER') NULL,
    ADD COLUMN `linkDetached` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `Document_linkedFromId_idx` ON `Document`(`linkedFromId`);

ALTER TABLE `Document` ADD CONSTRAINT `Document_linkedFromId_fkey` FOREIGN KEY (`linkedFromId`) REFERENCES `Document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

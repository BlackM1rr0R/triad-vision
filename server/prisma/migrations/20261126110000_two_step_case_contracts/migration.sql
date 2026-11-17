-- Two-step case contracts (lib/caseContracts): Əmək müqaviləsi (Triad Vision ↔ client) first, then İş müqaviləsi.

-- New contract template kind LABOUR (Əmək müqaviləsi).
ALTER TABLE `ContractTemplate` MODIFY `kind` ENUM('WORK', 'AUSBILDUNG', 'SERVICE', 'EMPLOYER', 'PARTNER', 'LABOUR') NOT NULL;

-- Which of the two case contracts a signature request is, its staff approval and the signed copy in the drive.
ALTER TABLE `SignatureRequest`
    ADD COLUMN `contractKind` ENUM('WORK', 'AUSBILDUNG', 'SERVICE', 'EMPLOYER', 'PARTNER', 'LABOUR') NULL,
    ADD COLUMN `approvedAt` DATETIME(3) NULL,
    ADD COLUMN `approvedById` VARCHAR(191) NULL,
    ADD COLUMN `driveNodeId` VARCHAR(191) NULL;

CREATE INDEX `SignatureRequest_caseId_contractKind_idx` ON `SignatureRequest`(`caseId`, `contractKind`);

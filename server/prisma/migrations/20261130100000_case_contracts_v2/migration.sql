-- Case contracts V2 (lib/caseContracts): staff upload their own PDF with signature places, the client signs first.
-- Additive, nullable columns only: existing requests keep the old flow (contractFlow NULL).
ALTER TABLE `SignatureRequest`
  ADD COLUMN `contractFlow` VARCHAR(8) NULL,
  ADD COLUMN `placements` JSON NULL,
  ADD COLUMN `returnedAt` DATETIME(3) NULL,
  ADD COLUMN `returnReason` TEXT NULL,
  ADD COLUMN `supersededAt` DATETIME(3) NULL;

-- Per-client "seen" marks of the documents sent to the client (Sənədlər > Bizdən gələn sənədlər).
CREATE TABLE `CaseReceivedDocSeen` (
    `userId` VARCHAR(40) NOT NULL,
    `documentId` VARCHAR(40) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaseReceivedDocSeen_caseId_userId_idx`(`caseId`, `userId`),
    PRIMARY KEY (`userId`, `documentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

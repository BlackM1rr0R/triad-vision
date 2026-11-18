-- Performance indexes only (no data or column change). InnoDB builds secondary indexes online
-- (ALGORITHM=INPLACE, LOCK=NONE by default on MySQL 8.4), so reads and writes continue meanwhile.

-- staff / admin lookups by role (scheduler jobs, live chat, digests, alerts)
CREATE INDEX `User_role_isActive_idx` ON `User`(`role`, `isActive`);
-- access anomalies / security alerts: sessions created in a time window
CREATE INDEX `Session_createdAt_idx` ON `Session`(`createdAt`);
-- admin case list / dashboard: status filter + updatedAt sort, decision statistics
CREATE INDEX `Case_status_updatedAt_idx` ON `Case`(`status`, `updatedAt`);
CREATE INDEX `Case_decisionAt_idx` ON `Case`(`decisionAt`);
-- OCR job (every minute): documents not OCR'd yet, oldest first; document-expiry job
CREATE INDEX `Document_ocrAt_createdAt_idx` ON `Document`(`ocrAt`, `createdAt`);
CREATE INDEX `Document_expiresAt_idx` ON `Document`(`expiresAt`);
-- "entered this status" lookups (reminders, overdue filter, automation, forecasts)
CREATE INDEX `CaseEvent_caseId_toStatus_createdAt_idx` ON `CaseEvent`(`caseId`, `toStatus`, `createdAt`);
-- notification list: WHERE userId ORDER BY createdAt DESC
CREATE INDEX `Notification_userId_createdAt_idx` ON `Notification`(`userId`, `createdAt`);
-- drive text indexer (every 2 min): FILE, not deleted, newest change first, stale textIndexedAt checked in the index
CREATE INDEX `DriveNode_kind_deletedAt_updatedAt_textIndexedAt_idx` ON `DriveNode`(`kind`, `deletedAt`, `updatedAt`, `textIndexedAt`);
-- messaging-outbound pruning (createdAt < now - 180 d)
CREATE INDEX `OutboundMessage_createdAt_idx` ON `OutboundMessage`(`createdAt`);
-- interview invite nudges: OPEN invites older than 48 h
CREATE INDEX `InterviewInvite_status_createdAt_idx` ON `InterviewInvite`(`status`, `createdAt`);
-- workspace housekeeping: polls to close
CREATE INDEX `Poll_closedAt_closesAt_idx` ON `Poll`(`closedAt`, `closesAt`);
-- upload-AI sweep: PENDING insights, oldest first
CREATE INDEX `DocumentInsight_status_createdAt_idx` ON `DocumentInsight`(`status`, `createdAt`);
-- campaigns tick (every 10 s): failed SMS rows changed in the last 3 h
CREATE INDEX `CampaignRecipient_channel_status_updatedAt_idx` ON `CampaignRecipient`(`channel`, `status`, `updatedAt`);
-- access anomalies: document views in the last hour
CREATE INDEX `DocumentAccessLog_lastAt_idx` ON `DocumentAccessLog`(`lastAt`);

-- Hot AuditLog lookups: by action within a time window (security alert rules, oversight) and by target (drive versions, retention).
CREATE INDEX `AuditLog_action_createdAt_idx` ON `AuditLog`(`action`, `createdAt`);

CREATE INDEX `AuditLog_target_idx` ON `AuditLog`(`target`);

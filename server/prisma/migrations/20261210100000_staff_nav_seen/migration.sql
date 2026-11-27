-- Per-staff "last opened" timestamps for the sidebar badges (new users, new cases).
ALTER TABLE `StaffPreferences` ADD COLUMN `usersSeenAt` DATETIME(3) NULL, ADD COLUMN `casesSeenAt` DATETIME(3) NULL;

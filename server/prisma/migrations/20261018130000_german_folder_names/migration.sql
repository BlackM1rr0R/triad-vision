-- Folder names in the drive are German from now on.
UPDATE `DriveNode` SET `name` = 'Firmenlaufwerk' WHERE `space` = 'SHARED' AND `parentId` IS NULL AND `system` = 1 AND `name` = 'Company drive';
UPDATE `DriveNode` SET `name` = 'Anträge' WHERE `space` = 'CASES' AND `parentId` IS NULL AND `system` = 1 AND `name` = 'Cases';
UPDATE `DriveNode` SET `name` = 'Aufgabendateien' WHERE `system` = 1 AND `kind` = 'FOLDER' AND `name` = 'Tapşırıq faylları';
UPDATE `DriveNode` SET `name` = 'Alle Kunden' WHERE `system` = 1 AND `kind` = 'FOLDER' AND `name` = 'Bütün müştərilər';
UPDATE `DriveNode` SET `name` = 'Alle Kunden.xlsx' WHERE `system` = 1 AND `kind` = 'FILE' AND `name` = 'Bütün müştərilər.xlsx';
UPDATE `DriveNode` SET `name` = REPLACE(`name`, 'Silinmiş istifadəçi — ', 'Gelöschter Benutzer — ') WHERE `name` LIKE 'Silinmiş istifadəçi — %';

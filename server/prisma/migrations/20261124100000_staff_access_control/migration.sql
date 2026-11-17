-- Staff access control (lib/access): role templates, per-user access, teams, break-glass grants.
-- Nothing changes on deploy: no StaffAccess row = the legacy template of the role (every area, as today) and case scope ALL.

-- CreateTable
CREATE TABLE `StaffRoleTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(40) NULL,
    `name` JSON NOT NULL,
    `description` JSON NULL,
    `matrix` JSON NOT NULL,
    `builtIn` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffRoleTemplate_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffAccess` (
    `userId` VARCHAR(40) NOT NULL,
    `templateId` VARCHAR(40) NULL,
    `overrides` JSON NULL,
    `caseScope` VARCHAR(12) NOT NULL DEFAULT 'ALL',
    `manageAccess` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffAccess_templateId_idx`(`templateId`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffTeam` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffTeamMember` (
    `teamId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StaffTeamMember_userId_idx`(`userId`),
    PRIMARY KEY (`teamId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BreakGlassGrant` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `caseId` VARCHAR(40) NOT NULL,
    `reason` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BreakGlassGrant_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `BreakGlassGrant_caseId_idx`(`caseId`),
    INDEX `BreakGlassGrant_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StaffTeamMember` ADD CONSTRAINT `StaffTeamMember_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `StaffTeam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: built-in role templates (editable in the Access Center; legacy_* = today's access)
INSERT INTO `StaffRoleTemplate` (`id`, `key`, `name`, `description`, `matrix`, `builtIn`, `createdAt`, `updatedAt`) VALUES
('tpl_legacy_staff', 'legacy_staff', '{"az":"Köhnə STAFF (bugünkü giriş)","de":"Legacy STAFF (bisheriger Zugriff)","en":"Legacy STAFF (today’s access)","ru":"Прежний STAFF (текущий доступ)"}', '{"az":"Hər STAFF istifadəçisi üçün standart. Bugünkü kimi: bütün bölmələr açıqdır, yalnız ADMIN səhifələri bağlıdır.","de":"Standard für jede STAFF-Rolle. Wie bisher: alle Bereiche offen, nur ADMIN-Seiten gesperrt.","en":"Default for every STAFF user. Same as today: every area open, only ADMIN pages closed.","ru":"По умолчанию для каждого STAFF. Как сейчас: все разделы открыты, закрыты только страницы ADMIN."}', '{"cases":["view","edit","delete","export"],"clients":["view","edit","delete","export"],"documents":["view","edit","delete","export"],"finance":["view","edit","delete","export"],"employers":["view","edit","delete","export"],"partners":["view","edit","delete","export"],"content":["view","edit","delete","export"],"settings":["view","edit","delete","export"],"drive":["view","edit","delete","export"],"reports":["view","edit","delete","export"],"communications":["view","edit","delete","export"],"analytics":["view","edit","delete","export"]}', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('tpl_legacy_admin', 'legacy_admin', '{"az":"Köhnə ADMIN (bugünkü giriş)","de":"Legacy ADMIN (bisheriger Zugriff)","en":"Legacy ADMIN (today’s access)","ru":"Прежний ADMIN (текущий доступ)"}', '{"az":"Hər ADMIN istifadəçisi üçün standart. Bugünkü kimi: bütün bölmələr açıqdır.","de":"Standard für jede ADMIN-Rolle. Wie bisher: alle Bereiche offen.","en":"Default for every ADMIN user. Same as today: every area open.","ru":"По умолчанию для каждого ADMIN. Как сейчас: все разделы открыты."}', '{"cases":["view","edit","delete","export"],"clients":["view","edit","delete","export"],"documents":["view","edit","delete","export"],"finance":["view","edit","delete","export"],"employers":["view","edit","delete","export"],"partners":["view","edit","delete","export"],"content":["view","edit","delete","export"],"settings":["view","edit","delete","export"],"drive":["view","edit","delete","export"],"reports":["view","edit","delete","export"],"communications":["view","edit","delete","export"],"analytics":["view","edit","delete","export"]}', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('tpl_manager', 'manager', '{"az":"Rəhbər / Menecer (hamısı)","de":"Leitung (alles)","en":"Manager (all)","ru":"Руководитель (всё)"}', '{"az":"Bütün bölmələr, bütün əməliyyatlar.","de":"Alle Bereiche, alle Aktionen.","en":"Every area, every action.","ru":"Все разделы, все действия."}', '{"cases":["view","edit","delete","export"],"clients":["view","edit","delete","export"],"documents":["view","edit","delete","export"],"finance":["view","edit","delete","export"],"employers":["view","edit","delete","export"],"partners":["view","edit","delete","export"],"content":["view","edit","delete","export"],"settings":["view","edit","delete","export"],"drive":["view","edit","delete","export"],"reports":["view","edit","delete","export"],"communications":["view","edit","delete","export"],"analytics":["view","edit","delete","export"]}', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('tpl_sales', 'sales', '{"az":"Satış meneceri","de":"Vertrieb","en":"Sales manager","ru":"Менеджер по продажам"}', '{"az":"Müraciətlər, müştərilər, işəgötürənlər, partnyorlar və yazışma. Maliyyə və parametrlər bağlıdır.","de":"Anfragen, Kunden, Arbeitgeber, Partner und Kommunikation. Finanzen und Einstellungen gesperrt.","en":"Leads, clients, employers, partners and messages. Finance and settings closed.","ru":"Заявки, клиенты, работодатели, партнёры и переписка. Финансы и настройки закрыты."}', '{"cases":["view","edit"],"clients":["view","edit","export"],"documents":["view"],"employers":["view","edit","export"],"partners":["view","edit"],"drive":["view","edit"],"reports":["view"],"communications":["view","edit"],"analytics":["view"]}', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('tpl_documents', 'documents', '{"az":"Sənəd mütəxəssisi","de":"Dokumentensachbearbeitung","en":"Document specialist","ru":"Специалист по документам"}', '{"az":"Müraciətlər, sənədlər, disk və müştəri ilə yazışma. Maliyyə və parametrlər bağlıdır.","de":"Fälle, Dokumente, Ablage und Kundenkommunikation. Finanzen und Einstellungen gesperrt.","en":"Cases, documents, drive and client messages. Finance and settings closed.","ru":"Дела, документы, диск и переписка с клиентом. Финансы и настройки закрыты."}', '{"cases":["view","edit"],"clients":["view","edit"],"documents":["view","edit","delete","export"],"employers":["view"],"drive":["view","edit","export"],"communications":["view","edit"]}', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('tpl_accountant', 'accountant', '{"az":"Mühasib","de":"Buchhaltung","en":"Accountant","ru":"Бухгалтер"}', '{"az":"Maliyyə tam, hesabatlar. Müraciətlərə və müştərilərə yalnız baxış. Sənədlər (pasport və s.) bağlıdır.","de":"Finanzen voll, Berichte. Fälle und Kunden nur lesen. Dokumente (Pass usw.) gesperrt.","en":"Finance in full, reports. Cases and clients read only. Documents (passport etc.) closed.","ru":"Финансы полностью, отчёты. Дела и клиенты только просмотр. Документы (паспорт и т. д.) закрыты."}', '{"cases":["view"],"clients":["view"],"finance":["view","edit","delete","export"],"employers":["view"],"partners":["view"],"reports":["view","export"],"analytics":["view"]}', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('tpl_content', 'content', '{"az":"Məzmun redaktoru","de":"Redaktion","en":"Content editor","ru":"Редактор контента"}', '{"az":"Sayt məzmunu, bələdçilər, statistika. Müştəri və müraciət məlumatları bağlıdır.","de":"Website-Inhalte, Ratgeber, Statistik. Kunden- und Falldaten gesperrt.","en":"Website content, guides, statistics. Client and case data closed.","ru":"Контент сайта, гиды, статистика. Данные клиентов и дел закрыты."}', '{"content":["view","edit","delete"],"drive":["view","edit"],"communications":["view"],"analytics":["view"]}', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

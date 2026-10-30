import { prisma } from '../../db.js';
import { computeProfitability, COST_KEYS } from '../profitability/compute.js';
import { getProfitSettings } from '../profitability/settings.js';
import * as LB from './labels.js';
import { L, type ColumnDef, type DatasetDef, type FilterOp, type Rec } from './types.js';
import { timeEntriesDataset } from '../timeTracking/reportDataset.js'; // "timeEntries" dataset

/**
 * The curated datasets of the report builder. Columns read Prisma paths (to-one relations, resolved in the
 * same query — no N+1) or small getters over a declared select. Money is in cents, dates are Date objects.
 */

const fullName = (u: unknown) => {
  const x = u as { firstName?: string; lastName?: string } | null | undefined;
  return x ? `${x.firstName ?? ''} ${x.lastName ?? ''}`.trim() : null;
};
const userSelect = { select: { firstName: true, lastName: true } };
const titleOf = (v: unknown) => {
  const t = v as Record<string, string> | null | undefined;
  return t ? (t.az ?? t.de ?? t.en ?? Object.values(t)[0] ?? null) : null;
};
const enumKeys = (labels: Record<string, unknown>) => Object.keys(labels);

/** Name filter spanning first and last name of a relation (or the record itself when rel is ''). */
const nameWhere = (rel: string) => (op: FilterOp, value: unknown): Record<string, unknown> | null => {
  const v = String(value ?? '').trim();
  const wrap = (cond: Record<string, unknown>) => (rel ? { [rel]: cond } : cond);
  if (op === 'contains' && v) {
    const parts = v.split(/\s+/).slice(0, 3);
    return { AND: parts.map((p) => wrap({ OR: [{ firstName: { contains: p } }, { lastName: { contains: p } }] })) };
  }
  return null;
};

// ─── Shared column builders ─────────────────────────────────────────────

const col = (key: string, label: ReturnType<typeof L>, type: ColumnDef['type'], extra: Partial<ColumnDef> = {}): ColumnDef => ({ key, label, type, ...extra });

const userCol = (key: string, label: ReturnType<typeof L>, idPath: string, rel: string, extra: Partial<ColumnDef> = {}): ColumnDef =>
  col(key, label, 'user', { path: idPath, select: { [rel]: userSelect }, get: (r) => fullName(r[rel]), ...extra });

const created = (extra: Partial<ColumnDef> = {}) => col('createdAt', L('Yaradılıb', 'Erstellt am', 'Created', 'Создано'), 'date', { path: 'createdAt', ...extra });

const caseNumberVia = (rel = 'case') => col('caseNumber', L('Müraciət №', 'Fall-Nr.', 'Case no.', '№ дела'), 'string', { path: `${rel}.number`, default: true });

const clientNameVia = (rel: string, key = 'clientName', isDefault = true) =>
  col(key, L('Müştəri', 'Kunde', 'Client', 'Клиент'), 'string', { select: { [rel]: userSelect }, get: (r) => fullName(r[rel]), where: nameWhere(rel), default: isDefault });

// ─── Datasets ───────────────────────────────────────────────────────────

const cases: DatasetDef = {
  key: 'cases',
  label: L('Müraciətlər', 'Fälle', 'Cases', 'Дела'),
  description: L('Viza müraciətləri: status, növ, əməkdaş, işəgötürən, tarixlər', 'Visumsfälle: Status, Art, Sachbearbeiter, Arbeitgeber, Termine', 'Visa cases: status, type, staff, employer, dates', 'Визовые дела: статус, тип, сотрудник, работодатель, даты'),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'case',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    col('number', L('Müraciət №', 'Fall-Nr.', 'Case no.', '№ дела'), 'string', { path: 'number', default: true }),
    clientNameVia('client'),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.CASE_STATUS), enumLabels: LB.CASE_STATUS, default: true }),
    col('visaType', L('Viza növü', 'Visumart', 'Visa type', 'Тип визы'), 'enum', { path: 'visaType', enumValues: enumKeys(LB.VISA_TYPE), enumLabels: LB.VISA_TYPE, default: true }),
    col('category', L('Kateqoriya', 'Kategorie', 'Category', 'Категория'), 'string', {
      select: { visaCategory: { select: { slug: true, title: true, visaLabel: true } } },
      get: (r) => {
        const c = r.visaCategory as { slug: string; title: unknown; visaLabel: string | null } | null;
        return c ? `${titleOf(c.title) ?? c.slug}${c.visaLabel ? ` (${c.visaLabel})` : ''}` : null;
      },
    }),
    col('profession', L('Peşə', 'Beruf', 'Profession', 'Профессия'), 'string', { path: 'profession' }),
    userCol('staff', L('Məsul əməkdaş', 'Sachbearbeiter', 'Staff owner', 'Ответственный'), 'assignedStaffId', 'assignedStaff', { default: true }),
    col('company', L('İşəgötürən', 'Arbeitgeber', 'Employer', 'Работодатель'), 'string', { path: 'company.name' }),
    col('partner', L('Partnyor', 'Vermittler', 'Partner', 'Партнёр'), 'string', { path: 'partner.name' }),
    col('clientEmail', L('Müştəri e-poçtu', 'E-Mail des Kunden', 'Client e-mail', 'E-mail клиента'), 'string', { path: 'client.email' }),
    col('clientPhone', L('Müştəri telefonu', 'Telefon des Kunden', 'Client phone', 'Телефон клиента'), 'string', { path: 'client.phone', personal: true }),
    col('passportNumber', L('Pasport №', 'Pass-Nr.', 'Passport no.', '№ паспорта'), 'string', { path: 'client.passportNumber', maskField: 'passportNumber', personal: true }),
    created({ default: true }),
    col('updatedAt', L('Yenilənib', 'Geändert am', 'Updated', 'Обновлено'), 'date', { path: 'updatedAt' }),
    col('appointmentAt', L('Səfirlik görüşü', 'Botschaftstermin', 'Embassy appointment', 'Запись в посольство'), 'date', { path: 'appointmentAt' }),
    col('decisionAt', L('Qərar tarixi', 'Entscheidung am', 'Decision date', 'Дата решения'), 'date', { path: 'decisionAt' }),
    col('closedAt', L('Bağlanıb', 'Abgeschlossen am', 'Closed', 'Закрыто'), 'date', { path: 'closedAt' }),
    col('visaValidTo', L('Viza etibarlıdır (son)', 'Visum gültig bis', 'Visa valid to', 'Виза действует до'), 'date', { path: 'visaValidTo' }),
    col('daysOpen', L('Açıq gün', 'Tage offen', 'Days open', 'Дней открыто'), 'number', { total: 'avg',
      select: { createdAt: true, closedAt: true },
      get: (r, ctx) => Math.floor((((r.closedAt as Date | null) ?? ctx.now).getTime() - (r.createdAt as Date).getTime()) / 86_400_000),
    }),
    col('documents', L('Sənəd sayı', 'Dokumente', 'Documents', 'Документов'), 'number', { select: { _count: { select: { documents: true } } }, get: (r) => (r._count as { documents: number }).documents }),
  ],
};

const clients: DatasetDef = {
  key: 'clients',
  label: L('Müştərilər', 'Kunden', 'Clients', 'Клиенты'),
  description: L('Müştəri hesabları və profil məlumatları', 'Kundenkonten und Profildaten', 'Client accounts and profile data', 'Аккаунты клиентов и данные профиля'),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'user',
  baseWhere: { role: 'CLIENT' },
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    col('name', L('Ad Soyad', 'Name', 'Name', 'Имя'), 'string', { select: { firstName: true, lastName: true }, get: (r) => fullName(r), where: nameWhere(''), default: true }),
    col('email', L('E-poçt', 'E-Mail', 'E-mail', 'E-mail'), 'string', { path: 'email', default: true }),
    col('phone', L('Telefon', 'Telefon', 'Phone', 'Телефон'), 'string', { path: 'phone', personal: true, default: true }),
    col('city', L('Şəhər', 'Stadt', 'City', 'Город'), 'string', { path: 'city', default: true }),
    col('nationality', L('Vətəndaşlıq', 'Staatsangehörigkeit', 'Nationality', 'Гражданство'), 'string', { path: 'nationality' }),
    col('profession', L('Peşə', 'Beruf', 'Profession', 'Профессия'), 'string', { path: 'profession' }),
    col('germanLevel', L('Alman dili', 'Deutschniveau', 'German level', 'Уровень немецкого'), 'string', { path: 'germanLevel' }),
    col('experienceYears', L('Təcrübə (il)', 'Berufserfahrung (Jahre)', 'Experience (years)', 'Опыт (лет)'), 'number', { total: 'avg', path: 'experienceYears' }),
    col('drivingLicence', L('Sürücülük vəsiqəsi', 'Führerschein', 'Driving licence', 'Водительские права'), 'string', { path: 'drivingLicence' }),
    col('birthDate', L('Doğum tarixi', 'Geburtsdatum', 'Birth date', 'Дата рождения'), 'date', { path: 'birthDate', personal: true }),
    col('passportNumber', L('Pasport №', 'Pass-Nr.', 'Passport no.', '№ паспорта'), 'string', { path: 'passportNumber', maskField: 'passportNumber', personal: true }),
    col('passportExpiry', L('Pasportun bitmə tarixi', 'Pass gültig bis', 'Passport expiry', 'Паспорт действует до'), 'date', { path: 'passportExpiry' }),
    col('locale', L('Dil', 'Sprache', 'Language', 'Язык'), 'enum', { path: 'locale', enumValues: enumKeys(LB.LOCALE), enumLabels: LB.LOCALE }),
    col('isActive', L('Aktiv', 'Aktiv', 'Active', 'Активен'), 'boolean', { path: 'isActive' }),
    col('cases', L('Müraciət sayı', 'Fälle', 'Cases', 'Дел'), 'number', { select: { _count: { select: { cases: true } } }, get: (r) => (r._count as { cases: number }).cases, default: true }),
    created({ default: true, label: L('Qeydiyyat', 'Registriert am', 'Registered', 'Регистрация') }),
  ],
};

const documents: DatasetDef = {
  key: 'documents',
  label: L('Sənədlər', 'Dokumente', 'Documents', 'Документы'),
  description: L('Müraciətlərə yüklənmiş sənədlər və yoxlama statusu', 'Hochgeladene Falldokumente und Prüfstatus', 'Case documents and review status', 'Документы дел и статус проверки'),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'document',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    caseNumberVia(),
    col('clientName', L('Müştəri', 'Kunde', 'Client', 'Клиент'), 'string', {
      select: { case: { select: { client: userSelect } } },
      get: (r) => fullName((r.case as { client: unknown } | null)?.client),
      where: (op, v) => {
        const w = nameWhere('client')(op, v);
        return w ? { case: w } : null;
      },
      default: true,
    }),
    col('name', L('Fayl', 'Datei', 'File', 'Файл'), 'string', { path: 'originalName', default: true }),
    col('stage', L('Mərhələ', 'Phase', 'Stage', 'Этап'), 'enum', { path: 'stage', enumValues: enumKeys(LB.DOC_STAGE), enumLabels: LB.DOC_STAGE, default: true }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.DOC_STATUS), enumLabels: LB.DOC_STATUS, default: true }),
    col('mimeType', L('Fayl tipi', 'Dateityp', 'File type', 'Тип файла'), 'string', { path: 'mimeType' }),
    col('sizeKb', L('Ölçü (KB)', 'Größe (KB)', 'Size (KB)', 'Размер (КБ)'), 'number', { select: { size: true }, get: (r) => Math.round((r.size as number) / 1024) }),
    userCol('uploadedBy', L('Yükləyib', 'Hochgeladen von', 'Uploaded by', 'Загрузил'), 'uploadedById', 'uploadedBy'),
    col('expiresAt', L('Etibarlılıq sonu', 'Gültig bis', 'Expires', 'Действует до'), 'date', { path: 'expiresAt' }),
    created({ default: true, label: L('Yüklənib', 'Hochgeladen am', 'Uploaded', 'Загружено') }),
  ],
};

const tasks: DatasetDef = {
  key: 'tasks',
  label: L('Tapşırıqlar', 'Aufgaben', 'Tasks', 'Задачи'),
  description: L('Komanda tapşırıqları, son tarixlər və icraçılar', 'Teamaufgaben, Fristen und Zuständige', 'Team tasks, deadlines and assignees', 'Задачи команды, сроки и исполнители'),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'task',
  dateColumn: 'dueAt',
  defaultSort: { column: 'dueAt', dir: 'asc' },
  columns: [
    col('number', L('№', 'Nr.', 'No.', '№'), 'string', { select: { number: true }, get: (r) => `T-${String(r.number).padStart(4, '0')}`, default: true }),
    col('title', L('Başlıq', 'Titel', 'Title', 'Название'), 'string', { path: 'title', default: true }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.TASK_STATUS), enumLabels: LB.TASK_STATUS, default: true }),
    col('priority', L('Prioritet', 'Priorität', 'Priority', 'Приоритет'), 'enum', { path: 'priority', enumValues: enumKeys(LB.TASK_PRIORITY), enumLabels: LB.TASK_PRIORITY, default: true }),
    col('assignees', L('İcraçılar', 'Zuständig', 'Assignees', 'Исполнители'), 'string', {
      select: { assignees: { select: { user: userSelect } } },
      get: (r) => ((r.assignees as { user: unknown }[]) ?? []).map((a) => fullName(a.user)).filter(Boolean).join(', ') || null,
      where: (op, v) => {
        const w = nameWhere('user')(op, v);
        return w ? { assignees: { some: w } } : null;
      },
      noGroup: true,
      default: true,
    }),
    col('dueAt', L('Son tarix', 'Fällig am', 'Due', 'Срок'), 'date', { path: 'dueAt', default: true }),
    col('overdue', L('Gecikir', 'Überfällig', 'Overdue', 'Просрочена'), 'boolean', {
      select: { dueAt: true, status: true },
      get: (r, ctx) => !!r.dueAt && (r.dueAt as Date) < ctx.now && !['DONE', 'CANCELLED'].includes(r.status as string),
    }),
    col('completedAt', L('Bitirilib', 'Erledigt am', 'Completed', 'Выполнено'), 'date', { path: 'completedAt' }),
    caseNumberVia(),
    userCol('createdBy', L('Yaradıb', 'Erstellt von', 'Created by', 'Создал'), 'createdById', 'createdBy'),
    created(),
  ],
};

const inquiries: DatasetDef = {
  key: 'inquiries',
  label: L('Sorğular / lidlər', 'Anfragen / Leads', 'Inquiries / leads', 'Заявки / лиды'),
  description: L('Saytdan gələn şirkət və əlaqə sorğuları', 'Unternehmens- und Kontaktanfragen der Website', 'Company and contact inquiries from the website', 'Заявки компаний и контакты с сайта'),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'inquiry',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    col('kind', L('Növ', 'Art', 'Kind', 'Тип'), 'enum', { path: 'kind', enumValues: enumKeys(LB.INQUIRY_KIND), enumLabels: LB.INQUIRY_KIND, default: true }),
    col('companyName', L('Şirkət', 'Unternehmen', 'Company', 'Компания'), 'string', { path: 'companyName', default: true }),
    col('contactName', L('Əlaqə şəxsi', 'Ansprechpartner', 'Contact', 'Контактное лицо'), 'string', { path: 'contactName', default: true }),
    col('email', L('E-poçt', 'E-Mail', 'E-mail', 'E-mail'), 'string', { path: 'email' }),
    col('phone', L('Telefon', 'Telefon', 'Phone', 'Телефон'), 'string', { path: 'phone', personal: true }),
    col('sector', L('Sahə', 'Branche', 'Sector', 'Отрасль'), 'string', { path: 'sector' }),
    col('workersNeeded', L('Lazım olan işçi', 'Benötigte Mitarbeiter', 'Workers needed', 'Нужно работников'), 'number', { path: 'workersNeeded', default: true }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.INQUIRY_STATUS), enumLabels: LB.INQUIRY_STATUS, default: true }),
    col('locale', L('Dil', 'Sprache', 'Language', 'Язык'), 'enum', { path: 'locale', enumValues: enumKeys(LB.LOCALE), enumLabels: LB.LOCALE }),
    created({ default: true }),
  ],
};

const bookings: DatasetDef = {
  key: 'bookings',
  label: L('Konsultasiyalar', 'Beratungstermine', 'Bookings', 'Консультации'),
  description: L('Onlayn konsultasiya bronları', 'Gebuchte Online-Beratungen', 'Booked online consultations', 'Забронированные онлайн-консультации'),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'booking',
  dateColumn: 'startsAt',
  defaultSort: { column: 'startsAt', dir: 'desc' },
  columns: [
    col('startsAt', L('Vaxt', 'Termin', 'Time', 'Время'), 'date', { path: 'slot.startsAt', default: true }),
    col('name', L('Ad', 'Name', 'Name', 'Имя'), 'string', { path: 'name', default: true }),
    col('email', L('E-poçt', 'E-Mail', 'E-mail', 'E-mail'), 'string', { path: 'email' }),
    col('phone', L('Telefon', 'Telefon', 'Phone', 'Телефон'), 'string', { path: 'phone', personal: true }),
    col('topic', L('Mövzu', 'Thema', 'Topic', 'Тема'), 'string', { path: 'topic', default: true }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.BOOKING_STATUS), enumLabels: LB.BOOKING_STATUS, default: true }),
    col('staff', L('Əməkdaş', 'Berater', 'Staff', 'Сотрудник'), 'user', { path: 'slot.staffId', select: { slot: { select: { staff: userSelect } } }, get: (r) => fullName((r.slot as { staff: unknown } | null)?.staff), default: true }),
    col('locale', L('Dil', 'Sprache', 'Language', 'Язык'), 'enum', { path: 'locale', enumValues: enumKeys(LB.LOCALE), enumLabels: LB.LOCALE }),
    created({ label: L('Bron edilib', 'Gebucht am', 'Booked on', 'Забронировано') }),
  ],
};

const applications: DatasetDef = {
  key: 'applications',
  label: L('Vakansiya müraciətləri', 'Bewerbungen', 'Applications', 'Отклики на вакансии'),
  description: L('Namizədlərin vakansiyalara müraciətləri', 'Bewerbungen der Kandidaten auf Stellen', 'Candidate applications to vacancies', 'Отклики кандидатов на вакансии'),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'vacancyApplication',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    clientNameVia('user', 'candidate'),
    col('vacancy', L('Vakansiya', 'Stelle', 'Vacancy', 'Вакансия'), 'string', { select: { vacancy: { select: { title: true, slug: true } } }, get: (r) => titleOf((r.vacancy as { title: unknown }).title), default: true }),
    col('company', L('İşəgötürən', 'Arbeitgeber', 'Employer', 'Работодатель'), 'string', { path: 'vacancy.company.name', default: true }),
    col('city', L('Şəhər', 'Ort', 'City', 'Город'), 'string', { path: 'vacancy.city' }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.APPLICATION_STATUS), enumLabels: LB.APPLICATION_STATUS, default: true }),
    col('matchScore', L('Uyğunluq, %', 'Passung, %', 'Match, %', 'Совпадение, %'), 'number', { total: 'avg', path: 'matchScore', default: true }),
    created({ default: true, label: L('Müraciət tarixi', 'Beworben am', 'Applied', 'Дата отклика') }),
    col('updatedAt', L('Yenilənib', 'Geändert am', 'Updated', 'Обновлено'), 'date', { path: 'updatedAt' }),
  ],
};

const vacancies: DatasetDef = {
  key: 'vacancies',
  label: L('Vakansiyalar', 'Stellen', 'Vacancies', 'Вакансии'),
  description: L('Vakansiyalar, yerlər və müraciət sayı', 'Stellen, Plätze und Bewerbungen', 'Vacancies, positions and applications', 'Вакансии, места и отклики'),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'vacancy',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    col('title', L('Vakansiya', 'Stelle', 'Vacancy', 'Вакансия'), 'string', { select: { title: true }, get: (r) => titleOf(r.title), default: true }),
    col('company', L('İşəgötürən', 'Arbeitgeber', 'Employer', 'Работодатель'), 'string', { path: 'company.name', default: true }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.VACANCY_STATUS), enumLabels: LB.VACANCY_STATUS, default: true }),
    col('employmentType', L('Məşğulluq', 'Beschäftigung', 'Employment', 'Занятость'), 'enum', { path: 'employmentType', enumValues: enumKeys(LB.EMPLOYMENT_TYPE), enumLabels: LB.EMPLOYMENT_TYPE }),
    col('city', L('Şəhər', 'Ort', 'City', 'Город'), 'string', { path: 'city' }),
    col('sector', L('Sahə', 'Branche', 'Sector', 'Отрасль'), 'string', { path: 'sector' }),
    col('positions', L('Yer sayı', 'Plätze', 'Positions', 'Мест'), 'number', { path: 'positions', default: true }),
    col('salaryMin', L('Maaş (min), EUR', 'Gehalt (min), EUR', 'Salary (min), EUR', 'Зарплата (мин), EUR'), 'number', { total: 'avg', path: 'salaryMin' }),
    col('salaryMax', L('Maaş (maks), EUR', 'Gehalt (max), EUR', 'Salary (max), EUR', 'Зарплата (макс), EUR'), 'number', { total: 'avg', path: 'salaryMax' }),
    col('applications', L('Müraciətlər', 'Bewerbungen', 'Applications', 'Откликов'), 'number', { select: { _count: { select: { applications: true } } }, get: (r) => (r._count as { applications: number }).applications, default: true }),
    col('publishedAt', L('Dərc edilib', 'Veröffentlicht am', 'Published', 'Опубликовано'), 'date', { path: 'publishedAt' }),
    created(),
  ],
};

const invoices: DatasetDef = {
  key: 'invoices',
  label: L('Hesab-fakturalar', 'Rechnungen', 'Invoices', 'Счета'),
  description: L('İşəgötürənlərə kəsilmiş hesablar və ödənişlər', 'Rechnungen an Arbeitgeber und Zahlungen', 'Employer invoices and payments', 'Счета работодателям и оплаты'),
  category: 'finance',
  minRole: 'ADMIN',
  model: 'invoice',
  dateColumn: 'issueDate',
  defaultSort: { column: 'issueDate', dir: 'desc' },
  columns: [
    col('number', L('Hesab №', 'Rechnungs-Nr.', 'Invoice no.', '№ счёта'), 'string', { path: 'number', default: true }),
    col('company', L('Şirkət', 'Unternehmen', 'Company', 'Компания'), 'string', { path: 'company.name', default: true }),
    col('vatId', L('VÖEN / USt-IdNr.', 'USt-IdNr.', 'VAT id', 'ИНН / VAT'), 'string', { path: 'company.vatId', maskField: 'vatId' }),
    col('issueDate', L('Tarix', 'Rechnungsdatum', 'Issue date', 'Дата'), 'date', { path: 'issueDate', default: true }),
    col('dueDate', L('Ödəniş tarixi', 'Fällig am', 'Due date', 'Срок оплаты'), 'date', { path: 'dueDate' }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.INVOICE_STATUS), enumLabels: LB.INVOICE_STATUS, default: true }),
    col('net', L('Netto', 'Netto', 'Net', 'Нетто'), 'money', { path: 'netCents', default: true }),
    col('vat', L('ƏDV', 'USt.', 'VAT', 'НДС'), 'money', { path: 'vatCents' }),
    col('gross', L('Brutto', 'Brutto', 'Gross', 'Брутто'), 'money', { path: 'grossCents', default: true }),
    col('currency', L('Valyuta', 'Währung', 'Currency', 'Валюта'), 'string', { path: 'currency' }),
    col('paidAt', L('Ödənilib', 'Bezahlt am', 'Paid on', 'Оплачено'), 'date', { path: 'paidAt' }),
    col('daysOverdue', L('Gecikmə, gün', 'Tage überfällig', 'Days overdue', 'Дней просрочки'), 'number', { total: 'avg',
      select: { dueDate: true, status: true },
      get: (r, ctx) => (['SENT', 'OVERDUE'].includes(r.status as string) ? Math.max(0, Math.floor((ctx.now.getTime() - (r.dueDate as Date).getTime()) / 86_400_000)) : null),
    }),
  ],
};

/** Settlement amounts (AZN or EUR) also shown in EUR at the current rate, so sums are meaningful. */
const eurOf = (centsKey: string, curKey: string) => (r: Rec, ctx: { eurAzn: number }) => {
  const c = r[centsKey] as number | null;
  if (c == null) return null;
  return Math.round(r[curKey] === 'AZN' ? c / ctx.eurAzn : c);
};

const settlements: DatasetDef = {
  key: 'settlements',
  label: L('Hesablaşmalar / ödənişlər', 'Abrechnungen / Zahlungen', 'Settlements / payments', 'Расчёты / платежи'),
  description: L('Hesablaşma cədvəli: razılaşdırılmış məbləğ, ödənilən, partnyor payı, xərclər', 'Abrechnungsliste: vereinbart, bezahlt, Partneranteil, Ausgaben', 'Settlement ledger: agreed, paid, partner share, expenses', 'Таблица расчётов: согласовано, оплачено, доля партнёра, расходы'),
  category: 'finance',
  minRole: 'ADMIN',
  model: 'settlementEntry',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    col('project', L('Layihə', 'Projekt', 'Project', 'Проект'), 'string', { path: 'project', default: true }),
    col('clientName', L('Müştəri', 'Kunde', 'Client', 'Клиент'), 'string', { path: 'clientName', default: true }),
    col('partner', L('Partnyor', 'Vermittler', 'Partner', 'Партнёр'), 'string', { path: 'partner.name', default: true }),
    col('employer', L('İşəgötürən', 'Arbeitgeber', 'Employer', 'Работодатель'), 'string', { path: 'employer' }),
    col('stage', L('Mərhələ', 'Phase', 'Stage', 'Этап'), 'enum', { path: 'stage', enumValues: enumKeys(LB.SETTLEMENT_STAGE), enumLabels: LB.SETTLEMENT_STAGE, default: true }),
    col('currency', L('Valyuta', 'Währung', 'Currency', 'Валюта'), 'enum', { path: 'currency', enumValues: ['AZN', 'EUR'], default: true }),
    col('amount', L('Razılaşdırılıb', 'Vereinbart', 'Agreed', 'Согласовано'), 'money', { path: 'amountCents', default: true }),
    col('paid', L('Ödənilib', 'Bezahlt', 'Paid', 'Оплачено'), 'money', { path: 'paidCents', default: true }),
    col('amountEur', L('Razılaşdırılıb (EUR)', 'Vereinbart (EUR)', 'Agreed (EUR)', 'Согласовано (EUR)'), 'money', { select: { amountCents: true, currency: true }, get: eurOf('amountCents', 'currency') }),
    col('paidEur', L('Ödənilib (EUR)', 'Bezahlt (EUR)', 'Paid (EUR)', 'Оплачено (EUR)'), 'money', { select: { paidCents: true, currency: true }, get: eurOf('paidCents', 'currency') }),
    col('partnerShare', L('Partnyor payı', 'Partneranteil', 'Partner share', 'Доля партнёра'), 'money', { path: 'partnerShareCents' }),
    col('partnerShareCurrency', L('Pay valyutası', 'Währung Anteil', 'Share currency', 'Валюта доли'), 'enum', { path: 'partnerShareCurrency', enumValues: ['AZN', 'EUR'] }),
    col('expenses', L('Xərclər (Rasxod)', 'Ausgaben', 'Expenses', 'Расходы'), 'money', { path: 'expensesCents' }),
    col('payAfterVisa', L('Vizadan sonra', 'Nach Visum', 'After visa', 'После визы'), 'boolean', { path: 'payAfterVisa' }),
    col('tlsDate', L('TLS tarixi', 'TLS-Termin', 'TLS date', 'Дата TLS'), 'date', { path: 'tlsDate' }),
    col('visaDate', L('Viza tarixi', 'Visum am', 'Visa date', 'Дата визы'), 'date', { path: 'visaDate' }),
    caseNumberVia(),
    created(),
  ],
};

const partners: DatasetDef = {
  key: 'partners',
  label: L('Partnyorlar', 'Vermittler', 'Referral partners', 'Партнёры'),
  description: L('Müştəri gətirən partnyorlar, müraciət sayı və komissiya', 'Vermittler mit Fällen und Provisionen', 'Referral partners with cases and commissions', 'Партнёры с делами и комиссиями'),
  category: 'finance',
  minRole: 'ADMIN',
  model: 'referralPartner',
  dateColumn: 'createdAt',
  defaultSort: { column: 'name', dir: 'asc' },
  columns: [
    col('name', L('Ad', 'Name', 'Name', 'Имя'), 'string', { path: 'name', default: true }),
    col('phone', L('Telefon', 'Telefon', 'Phone', 'Телефон'), 'string', { path: 'phone', personal: true }),
    col('email', L('E-poçt', 'E-Mail', 'E-mail', 'E-mail'), 'string', { path: 'email' }),
    col('active', L('Aktiv', 'Aktiv', 'Active', 'Активен'), 'boolean', { path: 'active', default: true }),
    col('commission', L('Standart komissiya', 'Standardprovision', 'Default commission', 'Комиссия по умолчанию'), 'money', { path: 'commissionCents' }),
    col('currency', L('Valyuta', 'Währung', 'Currency', 'Валюта'), 'string', { path: 'currency' }),
    // Profile (lib/partners/profile.ts)
    col('partnerType', L('Növ', 'Art', 'Type', 'Тип'), 'enum', {
      path: 'partnerType',
      enumValues: ['INDIVIDUAL', 'COMPANY'],
      enumLabels: { INDIVIDUAL: L('Fiziki şəxs', 'Privatperson', 'Individual', 'Физлицо'), COMPANY: L('Şirkət', 'Firma', 'Company', 'Компания') },
    }),
    col('companyName', L('Şirkət', 'Firma', 'Company', 'Компания'), 'string', { path: 'companyName' }),
    col('contactPerson', L('Əlaqədar şəxs', 'Ansprechpartner', 'Contact person', 'Контактное лицо'), 'string', { path: 'contactPerson', personal: true }),
    col('phone2', L('Telefon 2', 'Telefon 2', 'Phone 2', 'Телефон 2'), 'string', { path: 'phone2', personal: true }),
    col('whatsapp', L('WhatsApp', 'WhatsApp', 'WhatsApp', 'WhatsApp'), 'string', { path: 'whatsapp', personal: true }),
    col('city', L('Şəhər', 'Stadt', 'City', 'Город'), 'string', { path: 'city' }),
    col('country', L('Ölkə', 'Land', 'Country', 'Страна'), 'string', { path: 'country' }),
    col('taxId', L('VÖEN', 'Steuernummer', 'Tax id', 'ИНН'), 'string', { path: 'taxId', maskField: 'taxId' }),
    col('iban', L('IBAN', 'IBAN', 'IBAN', 'IBAN'), 'string', { path: 'iban', maskField: 'iban' }),
    col('contractStart', L('Müqavilə başlanğıcı', 'Vertragsbeginn', 'Contract start', 'Начало договора'), 'date', { path: 'contractStart' }),
    col('contractEnd', L('Müqavilə sonu', 'Vertragsende', 'Contract end', 'Конец договора'), 'date', { path: 'contractEnd' }),
    col('preferredLanguage', L('Dil', 'Sprache', 'Language', 'Язык'), 'string', { path: 'preferredLanguage' }),
    col('website', L('Veb sayt', 'Website', 'Website', 'Сайт'), 'string', { path: 'website' }),
    col('tags', L('Teqlər', 'Tags', 'Tags', 'Теги'), 'string', {
      select: { tags: true },
      get: (r) => (Array.isArray(r.tags) ? (r.tags as unknown[]).filter((t) => typeof t === 'string').join(', ') : ''),
      noFilter: true,
      noGroup: true,
    }),
    col('cases', L('Müraciətlər', 'Fälle', 'Cases', 'Дел'), 'number', { select: { _count: { select: { cases: true } } }, get: (r) => (r._count as { cases: number }).cases, default: true }),
    col('commissionsTotal', L('Komissiyalar (cəmi)', 'Provisionen gesamt', 'Commissions total', 'Комиссии всего'), 'money', {
      select: { commissions: { where: { status: { not: 'CANCELLED' } }, select: { amountCents: true, status: true } } },
      get: (r) => ((r.commissions as { amountCents: number }[]) ?? []).reduce((a, c) => a + c.amountCents, 0),
      default: true,
    }),
    col('commissionsPaid', L('Ödənilmiş komissiya', 'Bezahlte Provision', 'Commissions paid', 'Выплачено комиссий'), 'money', {
      select: { commissions: { where: { status: { not: 'CANCELLED' } }, select: { amountCents: true, status: true } } },
      get: (r) => ((r.commissions as { amountCents: number; status?: string }[]) ?? []).filter((c) => c.status === 'PAID').reduce((a, c) => a + c.amountCents, 0),
    }),
    created(),
  ],
};

const agentCommissions: DatasetDef = {
  key: 'agentCommissions',
  label: L('Agent komissiyaları', 'Agentenprovisionen', 'Agent commissions', 'Комиссии агентов'),
  description: L('Regional agentlərin komissiyaları', 'Provisionen der Regionalagenten', 'Commissions of regional agents', 'Комиссии региональных агентов'),
  category: 'finance',
  minRole: 'ADMIN',
  model: 'agentCommission',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    col('agent', L('Agent', 'Agent', 'Agent', 'Агент'), 'string', {
      path: 'agent.code',
      select: { agent: { select: { code: true, user: userSelect } } },
      get: (r) => {
        const a = r.agent as { code: string; user: unknown };
        return fullName(a.user) || a.code;
      },
      default: true,
    }),
    col('agentCode', L('Agent kodu', 'Agentencode', 'Agent code', 'Код агента'), 'string', { path: 'agent.code' }),
    col('iban', L('IBAN', 'IBAN', 'IBAN', 'IBAN'), 'string', { path: 'agent.iban', maskField: 'iban' }),
    clientNameVia('client', 'clientName'),
    caseNumberVia(),
    col('event', L('Hadisə', 'Anlass', 'Event', 'Событие'), 'string', { path: 'event', default: true }),
    col('amount', L('Məbləğ', 'Betrag', 'Amount', 'Сумма'), 'money', { path: 'amountCents', default: true }),
    col('currency', L('Valyuta', 'Währung', 'Currency', 'Валюта'), 'string', { path: 'currency' }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.COMMISSION_STATUS), enumLabels: LB.COMMISSION_STATUS, default: true }),
    col('approvedAt', L('Təsdiqlənib', 'Freigegeben am', 'Approved on', 'Подтверждена'), 'date', { path: 'approvedAt' }),
    col('paidAt', L('Ödənilib', 'Bezahlt am', 'Paid on', 'Выплачена'), 'date', { path: 'paidAt' }),
    created({ default: true }),
  ],
};

const partnerCommissions: DatasetDef = {
  key: 'partnerCommissions',
  label: L('Partnyor komissiyaları', 'Partnerprovisionen', 'Partner commissions', 'Комиссии партнёров'),
  description: L('Partnyorlara hesablanmış komissiyalar', 'Provisionen der Vermittler', 'Commissions of referral partners', 'Комиссии партнёров'),
  category: 'finance',
  minRole: 'ADMIN',
  model: 'partnerCommission',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    col('partner', L('Partnyor', 'Vermittler', 'Partner', 'Партнёр'), 'string', { path: 'partner.name', default: true }),
    col('caseId', L('Müraciət', 'Fall', 'Case', 'Дело'), 'string', { path: 'caseId', noGroup: true }),
    col('amount', L('Məbləğ', 'Betrag', 'Amount', 'Сумма'), 'money', { path: 'amountCents', default: true }),
    col('currency', L('Valyuta', 'Währung', 'Currency', 'Валюта'), 'string', { path: 'currency', default: true }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.COMMISSION_STATUS), enumLabels: LB.COMMISSION_STATUS, default: true }),
    col('dueAt', L('Ödəniş tarixi', 'Fällig am', 'Due', 'Срок'), 'date', { path: 'dueAt' }),
    col('paidAt', L('Ödənilib', 'Bezahlt am', 'Paid on', 'Выплачена'), 'date', { path: 'paidAt' }),
    created({ default: true }),
  ],
};

const signatures: DatasetDef = {
  key: 'signatures',
  label: L('İmza sorğuları', 'Signaturanfragen', 'Signature requests', 'Запросы подписи'),
  description: L('Elektron imza sorğuları və statusları', 'E-Signatur-Anfragen und Status', 'E-signature requests and status', 'Запросы электронной подписи и статусы'),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'signatureRequest',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  columns: [
    col('title', L('Başlıq', 'Titel', 'Title', 'Название'), 'string', { path: 'title', default: true }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { path: 'status', enumValues: enumKeys(LB.SIGNATURE_STATUS), enumLabels: LB.SIGNATURE_STATUS, default: true }),
    caseNumberVia(),
    col('company', L('Şirkət', 'Unternehmen', 'Company', 'Компания'), 'string', { path: 'company.name' }),
    userCol('createdBy', L('Göndərən', 'Erstellt von', 'Created by', 'Отправитель'), 'createdById', 'createdBy'),
    col('signers', L('İmzalayanlar', 'Unterzeichner', 'Signers', 'Подписантов'), 'number', { select: { _count: { select: { signers: true } } }, get: (r) => (r._count as { signers: number }).signers, default: true }),
    col('signed', L('İmzalanıb', 'Unterschrieben', 'Signed', 'Подписали'), 'number', {
      select: { signers: { select: { status: true } } },
      get: (r) => ((r.signers as { status: string }[]) ?? []).filter((s) => s.status === 'SIGNED').length,
    }),
    col('sentAt', L('Göndərilib', 'Versendet am', 'Sent', 'Отправлено'), 'date', { path: 'sentAt' }),
    col('completedAt', L('Tamamlanıb', 'Abgeschlossen am', 'Completed', 'Завершено'), 'date', { path: 'completedAt', default: true }),
    col('expiresAt', L('Bitmə tarixi', 'Läuft ab am', 'Expires', 'Истекает'), 'date', { path: 'expiresAt' }),
    created({ default: true }),
  ],
};

/** Campaign recipients — only when the campaigns module's model exists at runtime (memory dataset, defensive reads). */
const campaignDelegate = () => (prisma as unknown as Record<string, { findMany?: (a: unknown) => Promise<Rec[]> } | undefined>).campaignRecipient;

const pickStr = (r: Rec, ...keys: string[]) => {
  for (const k of keys) if (typeof r[k] === 'string' && r[k]) return r[k] as string;
  return null;
};
const pickDate = (r: Rec, ...keys: string[]) => {
  for (const k of keys) if (r[k] instanceof Date) return r[k] as Date;
  return null;
};

const campaignRecipients: DatasetDef = {
  key: 'campaignRecipients',
  label: L('Kampaniya alıcıları', 'Kampagnenempfänger', 'Campaign recipients', 'Получатели кампаний'),
  description: L('E-poçt kampaniyalarının alıcıları və çatdırılma', 'Empfänger von E-Mail-Kampagnen und Zustellung', 'Recipients of e-mail campaigns and delivery', 'Получатели e-mail-кампаний и доставка'),
  category: 'operations',
  minRole: 'ADMIN',
  available: () => typeof campaignDelegate()?.findMany === 'function',
  dateColumn: 'createdAt',
  defaultSort: { column: 'createdAt', dir: 'desc' },
  load: async ({ limit }) => {
    const d = campaignDelegate();
    if (!d?.findMany) return [];
    const rows = await d.findMany({ take: limit, orderBy: { id: 'desc' } });
    return rows.map((r) => ({
      campaign: pickStr(r, 'campaignId'),
      email: pickStr(r, 'email', 'address', 'to'),
      status: pickStr(r, 'status', 'state'),
      error: pickStr(r, 'error', 'lastError'),
      sentAt: pickDate(r, 'sentAt'),
      openedAt: pickDate(r, 'openedAt'),
      clickedAt: pickDate(r, 'clickedAt'),
      createdAt: pickDate(r, 'createdAt'),
    }));
  },
  columns: [
    col('campaign', L('Kampaniya', 'Kampagne', 'Campaign', 'Кампания'), 'string', { default: true }),
    col('email', L('E-poçt', 'E-Mail', 'E-mail', 'E-mail'), 'string', { default: true }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'string', { default: true }),
    col('error', L('Xəta', 'Fehler', 'Error', 'Ошибка'), 'string', { noGroup: true }),
    col('sentAt', L('Göndərilib', 'Gesendet am', 'Sent', 'Отправлено'), 'date', { default: true }),
    col('openedAt', L('Açılıb', 'Geöffnet am', 'Opened', 'Открыто'), 'date'),
    col('clickedAt', L('Klik', 'Geklickt am', 'Clicked', 'Клик'), 'date'),
    created(),
  ],
};

/** Profitability per case (memory dataset over lib/profitability), amounts in EUR cents. */
const profitability: DatasetDef = {
  key: 'profitability',
  label: L('Gəlirlilik (müraciət üzrə)', 'Rentabilität je Fall', 'Profitability per case', 'Рентабельность по делам'),
  description: L('Hər müraciət üzrə gəlir, xərclər və marja (EUR)', 'Umsatz, Kosten und Marge je Fall (EUR)', 'Revenue, costs and margin per case (EUR)', 'Выручка, расходы и маржа по делу (EUR)'),
  category: 'finance',
  minRole: 'ADMIN',
  dateColumn: 'createdAt',
  defaultSort: { column: 'margin', dir: 'desc' },
  load: async ({ limit }) => {
    const s = await getProfitSettings();
    const rows = await computeProfitability({}, s, { take: limit });
    return rows.map((p) => ({
      number: p.number,
      clientName: p.clientName,
      status: p.status,
      visaType: p.visaType,
      category: p.categoryLabel,
      staff: p.staffName,
      staffId: p.staffId,
      partner: p.partnerName,
      agent: p.agentName,
      company: p.companyName,
      createdAt: p.createdAt,
      revenueInvoices: p.revenue.INVOICE,
      revenuePayments: p.revenue.SETTLEMENT,
      revenueTranslations: p.revenue.TRANSLATION,
      revenue: p.revenue.total,
      ...Object.fromEntries(COST_KEYS.map((k) => [`cost_${k}`, p.costs[k]])),
      costs: p.costs.total,
      margin: p.marginCents,
      marginPct: p.marginPct,
    }));
  },
  columns: [
    col('number', L('Müraciət №', 'Fall-Nr.', 'Case no.', '№ дела'), 'string', { default: true }),
    col('clientName', L('Müştəri', 'Kunde', 'Client', 'Клиент'), 'string', { default: true }),
    col('status', L('Status', 'Status', 'Status', 'Статус'), 'enum', { enumValues: enumKeys(LB.CASE_STATUS), enumLabels: LB.CASE_STATUS }),
    col('visaType', L('Viza növü', 'Visumart', 'Visa type', 'Тип визы'), 'enum', { enumValues: enumKeys(LB.VISA_TYPE), enumLabels: LB.VISA_TYPE, default: true }),
    col('category', L('Kateqoriya', 'Kategorie', 'Category', 'Категория'), 'string'),
    col('staff', L('Məsul əməkdaş', 'Sachbearbeiter', 'Staff owner', 'Ответственный'), 'string'),
    col('partner', L('Partnyor', 'Vermittler', 'Partner', 'Партнёр'), 'string'),
    col('agent', L('Agent', 'Agent', 'Agent', 'Агент'), 'string'),
    col('company', L('İşəgötürən', 'Arbeitgeber', 'Employer', 'Работодатель'), 'string'),
    created({ label: L('Açılıb', 'Eröffnet am', 'Opened', 'Открыто') }),
    col('revenueInvoices', L('Gəlir: hesablar (netto)', 'Umsatz: Rechnungen (netto)', 'Revenue: invoices (net)', 'Выручка: счета (нетто)'), 'money'),
    col('revenuePayments', L('Gəlir: müştəri ödənişləri', 'Umsatz: Kundenzahlungen', 'Revenue: client payments', 'Выручка: платежи клиентов'), 'money'),
    col('revenueTranslations', L('Gəlir: tərcümələr', 'Umsatz: Übersetzungen', 'Revenue: translations', 'Выручка: переводы'), 'money'),
    col('revenue', L('Gəlir (cəmi)', 'Umsatz gesamt', 'Revenue total', 'Выручка всего'), 'money', { default: true }),
    ...COST_KEYS.map((k) => col(`cost_${k}`, L(`Xərc: ${LB.COST_CATEGORY[k].az}`, `Kosten: ${LB.COST_CATEGORY[k].de}`, `Cost: ${LB.COST_CATEGORY[k].en}`, `Расход: ${LB.COST_CATEGORY[k].ru}`), 'money')),
    col('costs', L('Xərclər (cəmi)', 'Kosten gesamt', 'Costs total', 'Расходы всего'), 'money', { default: true }),
    col('margin', L('Marja', 'Marge', 'Margin', 'Маржа'), 'money', { default: true }),
    col('marginPct', L('Marja, %', 'Marge, %', 'Margin, %', 'Маржа, %'), 'number', { total: 'avg', default: true }),
  ],
};

export const DATASETS: DatasetDef[] = [
  cases,
  clients,
  documents,
  tasks,
  inquiries,
  bookings,
  applications,
  vacancies,
  invoices,
  settlements,
  partners,
  agentCommissions,
  partnerCommissions,
  signatures,
  campaignRecipients,
  profitability,
  timeEntriesDataset, // staff time tracking (lib/timeTracking)
];

export const datasetByKey = (key: string) => DATASETS.find((d) => d.key === key && (d.available?.() ?? true));

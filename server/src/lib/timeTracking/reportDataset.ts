import { L, type ColumnDef, type DatasetDef, type FilterOp, type Rec } from '../reports/types.js';

/**
 * Report builder dataset "timeEntries" (finished staff time entries). Export to Excel / CSV / PDF and scheduled
 * e-mails come from the report builder itself. ADMIN+ (like every report dataset); hourly rates are not exposed.
 */

export const TIME_ACTIVITY_LABELS: Record<string, ReturnType<typeof L>> = {
  DOCUMENTS: L('Sənədlər', 'Dokumente', 'Documents', 'Документы'),
  CLIENT_COMMUNICATION: L('Müştəri ilə ünsiyyət', 'Kundenkommunikation', 'Client communication', 'Общение с клиентом'),
  EMPLOYER_COMMUNICATION: L('İşəgötürənlə ünsiyyət', 'Arbeitgeberkommunikation', 'Employer communication', 'Общение с работодателем'),
  TRANSLATION: L('Tərcümə', 'Übersetzung', 'Translation', 'Перевод'),
  EMBASSY: L('Səfirlik', 'Botschaft', 'Embassy', 'Посольство'),
  OTHER: L('Digər', 'Sonstiges', 'Other', 'Другое'),
};

const SOURCE_LABELS = { TIMER: L('Taymer', 'Timer', 'Timer', 'Таймер'), MANUAL: L('Əl ilə', 'Manuell', 'Manual', 'Вручную') };

const userSelect = { select: { firstName: true, lastName: true } };
const fullName = (u: unknown) => {
  const x = u as { firstName?: string; lastName?: string } | null | undefined;
  return x ? `${x.firstName ?? ''} ${x.lastName ?? ''}`.trim() : null;
};
const clientWhere = (op: FilterOp, value: unknown): Record<string, unknown> | null => {
  const v = String(value ?? '').trim();
  if (op !== 'contains' || !v) return null;
  return { AND: v.split(/\s+/).slice(0, 3).map((p) => ({ case: { client: { OR: [{ firstName: { contains: p } }, { lastName: { contains: p } }] } } })) };
};

const col = (key: string, label: ReturnType<typeof L>, type: ColumnDef['type'], extra: Partial<ColumnDef> = {}): ColumnDef => ({ key, label, type, ...extra });

export const timeEntriesDataset: DatasetDef = {
  key: 'timeEntries',
  label: L('İş vaxtı (vaxt uçotu)', 'Arbeitszeit (Zeiterfassung)', 'Staff time (time tracking)', 'Рабочее время (учёт времени)'),
  description: L(
    'Əməkdaşların müraciətlər üzrə sərf etdiyi vaxt: tarix, əməkdaş, fəaliyyət, dəqiqə',
    'Zeit der Mitarbeitenden je Fall: Datum, Mitarbeiter, Tätigkeit, Minuten',
    'Time staff spent per case: date, staff member, activity, minutes',
    'Время сотрудников по делам: дата, сотрудник, деятельность, минуты',
  ),
  category: 'operations',
  minRole: 'ADMIN',
  model: 'timeEntry',
  baseWhere: { endedAt: { not: null } },
  dateColumn: 'startedAt',
  defaultSort: { column: 'startedAt', dir: 'desc' },
  columns: [
    col('startedAt', L('Tarix', 'Datum', 'Date', 'Дата'), 'date', { path: 'startedAt', default: true }),
    col('staff', L('Əməkdaş', 'Mitarbeiter', 'Staff member', 'Сотрудник'), 'user', { path: 'userId', select: { user: userSelect }, get: (r: Rec) => fullName(r.user), default: true }),
    col('caseNumber', L('Müraciət №', 'Fall-Nr.', 'Case no.', '№ дела'), 'string', { path: 'case.number', default: true }),
    col('clientName', L('Müştəri', 'Kunde', 'Client', 'Клиент'), 'string', { select: { case: { select: { client: userSelect } } }, get: (r: Rec) => fullName((r.case as { client?: unknown } | null)?.client), where: clientWhere }),
    col('activity', L('Fəaliyyət', 'Tätigkeit', 'Activity', 'Деятельность'), 'enum', { path: 'activity', enumValues: Object.keys(TIME_ACTIVITY_LABELS), enumLabels: TIME_ACTIVITY_LABELS, default: true }),
    col('minutes', L('Dəqiqə', 'Minuten', 'Minutes', 'Минуты'), 'number', { path: 'minutes', default: true }),
    col('hours', L('Saat', 'Stunden', 'Hours', 'Часы'), 'number', { select: { minutes: true }, get: (r: Rec) => Math.round(((r.minutes as number) / 60) * 100) / 100 }),
    col('source', L('Mənbə', 'Quelle', 'Source', 'Источник'), 'enum', { path: 'source', enumValues: Object.keys(SOURCE_LABELS), enumLabels: SOURCE_LABELS }),
    col('autoStopped', L('Avtomatik dayandırılıb', 'Automatisch gestoppt', 'Auto-stopped', 'Остановлен автоматически'), 'boolean', { path: 'autoStopped' }),
    col('note', L('Qeyd', 'Notiz', 'Note', 'Заметка'), 'string', { path: 'note', noGroup: true }),
    col('endedAt', L('Bitib', 'Ende', 'Ended', 'Окончание'), 'date', { path: 'endedAt' }),
  ],
};

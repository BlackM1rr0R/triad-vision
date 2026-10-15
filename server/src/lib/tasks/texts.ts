import type { Locale, TaskStatus } from '@prisma/client';

/**
 * Notification texts for team tasks, in the recipient's language (picked by `user.locale`).
 * Formal register: German "Sie", Russian "вы".
 */

type Msg = { title: string; body: string };

export interface DigestRow {
  key: string;
  title: string;
  due: string;
  overdue: boolean;
}

interface TaskCatalog {
  assigned: (p: { key: string; title: string; actor: string; due?: string }) => Msg;
  status: (p: { key: string; title: string; actor: string; status: TaskStatus }) => Msg;
  comment: (p: { key: string; title: string; actor: string; excerpt: string }) => Msg;
  mention: (p: { key: string; title: string; actor: string; excerpt: string }) => Msg;
  dueSoon: (p: { key: string; title: string; due: string }) => Msg;
  dueNow: (p: { key: string; title: string; due: string }) => Msg;
  overdue: (p: { key: string; title: string; due: string }) => Msg;
  digest: (p: { rows: DigestRow[] }) => Msg;
  statusLabel: Record<TaskStatus, string>;
  cta: { task: string; tasks: string };
}

const quote = (s: string) => (s ? `\n\n«${s}»` : '');
const dueLine = (label: string, due?: string) => (due ? `\n${label}: ${due}` : '');

const az: TaskCatalog = {
  assigned: (p) => ({
    title: `Sizə yeni tapşırıq verildi: ${p.key}`,
    body: `${p.actor} sizə tapşırıq verdi.\n\n${p.key} · ${p.title}${dueLine('Son tarix', p.due)}`,
  }),
  status: (p) => ({
    title: `${p.key}: status «${az.statusLabel[p.status]}»`,
    body: `${p.actor} «${p.title}» tapşırığının statusunu dəyişdi: ${az.statusLabel[p.status]}.`,
  }),
  comment: (p) => ({
    title: `${p.key}: yeni şərh`,
    body: `${p.actor} «${p.title}» tapşırığına şərh yazdı.${quote(p.excerpt)}`,
  }),
  mention: (p) => ({
    title: `${p.actor} sizi qeyd etdi (${p.key})`,
    body: `${p.actor} «${p.title}» tapşırığında sizi qeyd etdi.${quote(p.excerpt)}`,
  }),
  dueSoon: (p) => ({
    title: `Son tarix yaxınlaşır: ${p.key}`,
    body: `«${p.title}» tapşırığının son tarixi yaxınlaşır.\n\nSon tarix: ${p.due}`,
  }),
  dueNow: (p) => ({
    title: `Tapşırığın vaxtı çatdı: ${p.key}`,
    body: `«${p.title}» tapşırığının son tarixi indi çatır.\n\nSon tarix: ${p.due}`,
  }),
  overdue: (p) => ({
    title: `Tapşırıq gecikir: ${p.key}`,
    body: `«${p.title}» tapşırığının son tarixi keçib və tapşırıq hələ bitməyib.\n\nSon tarix: ${p.due}`,
  }),
  digest: ({ rows }) => {
    const overdue = rows.filter((r) => r.overdue).length;
    return {
      title: `Bu günün tapşırıqları: ${rows.length}${overdue ? ` (${overdue} gecikən)` : ''}`,
      body:
        'Sabahınız xeyir! Bu gün diqqət tələb edən tapşırıqlarınız:\n\n' +
        rows.map((r) => `• ${r.key} · ${r.title} — ${r.overdue ? `gecikir (${r.due})` : r.due}`).join('\n'),
    };
  },
  statusLabel: { TODO: 'Ediləcək', IN_PROGRESS: 'İcrada', REVIEW: 'Yoxlamada', DONE: 'Hazırdır', CANCELLED: 'Ləğv edildi' },
  cta: { task: 'Tapşırığı aç', tasks: 'Tapşırıqlara bax' },
};

const de: TaskCatalog = {
  assigned: (p) => ({
    title: `Neue Aufgabe für Sie: ${p.key}`,
    body: `${p.actor} hat Ihnen eine Aufgabe zugewiesen.\n\n${p.key} · ${p.title}${dueLine('Fällig', p.due)}`,
  }),
  status: (p) => ({
    title: `${p.key}: Status „${de.statusLabel[p.status]}“`,
    body: `${p.actor} hat den Status der Aufgabe „${p.title}“ geändert: ${de.statusLabel[p.status]}.`,
  }),
  comment: (p) => ({
    title: `${p.key}: neuer Kommentar`,
    body: `${p.actor} hat die Aufgabe „${p.title}“ kommentiert.${quote(p.excerpt)}`,
  }),
  mention: (p) => ({
    title: `${p.actor} hat Sie erwähnt (${p.key})`,
    body: `${p.actor} hat Sie in der Aufgabe „${p.title}“ erwähnt.${quote(p.excerpt)}`,
  }),
  dueSoon: (p) => ({
    title: `Frist rückt näher: ${p.key}`,
    body: `Die Frist der Aufgabe „${p.title}“ rückt näher.\n\nFällig: ${p.due}`,
  }),
  dueNow: (p) => ({
    title: `Aufgabe jetzt fällig: ${p.key}`,
    body: `Die Aufgabe „${p.title}“ ist jetzt fällig.\n\nFällig: ${p.due}`,
  }),
  overdue: (p) => ({
    title: `Aufgabe überfällig: ${p.key}`,
    body: `Die Frist der Aufgabe „${p.title}“ ist abgelaufen und die Aufgabe ist noch nicht erledigt.\n\nFällig war: ${p.due}`,
  }),
  digest: ({ rows }) => {
    const overdue = rows.filter((r) => r.overdue).length;
    return {
      title: `Ihre Aufgaben für heute: ${rows.length}${overdue ? ` (${overdue} überfällig)` : ''}`,
      body:
        'Guten Morgen! Diese Aufgaben brauchen heute Ihre Aufmerksamkeit:\n\n' +
        rows.map((r) => `• ${r.key} · ${r.title} — ${r.overdue ? `überfällig (${r.due})` : r.due}`).join('\n'),
    };
  },
  statusLabel: { TODO: 'Zu erledigen', IN_PROGRESS: 'In Arbeit', REVIEW: 'In Prüfung', DONE: 'Erledigt', CANCELLED: 'Abgebrochen' },
  cta: { task: 'Aufgabe öffnen', tasks: 'Zu den Aufgaben' },
};

const en: TaskCatalog = {
  assigned: (p) => ({
    title: `New task for you: ${p.key}`,
    body: `${p.actor} assigned a task to you.\n\n${p.key} · ${p.title}${dueLine('Due', p.due)}`,
  }),
  status: (p) => ({
    title: `${p.key}: status "${en.statusLabel[p.status]}"`,
    body: `${p.actor} changed the status of "${p.title}" to ${en.statusLabel[p.status]}.`,
  }),
  comment: (p) => ({
    title: `${p.key}: new comment`,
    body: `${p.actor} commented on "${p.title}".${quote(p.excerpt)}`,
  }),
  mention: (p) => ({
    title: `${p.actor} mentioned you (${p.key})`,
    body: `${p.actor} mentioned you in "${p.title}".${quote(p.excerpt)}`,
  }),
  dueSoon: (p) => ({
    title: `Deadline approaching: ${p.key}`,
    body: `The deadline of "${p.title}" is approaching.\n\nDue: ${p.due}`,
  }),
  dueNow: (p) => ({
    title: `Task is due now: ${p.key}`,
    body: `"${p.title}" is due now.\n\nDue: ${p.due}`,
  }),
  overdue: (p) => ({
    title: `Task overdue: ${p.key}`,
    body: `The deadline of "${p.title}" has passed and the task is not done yet.\n\nWas due: ${p.due}`,
  }),
  digest: ({ rows }) => {
    const overdue = rows.filter((r) => r.overdue).length;
    return {
      title: `Your tasks for today: ${rows.length}${overdue ? ` (${overdue} overdue)` : ''}`,
      body:
        'Good morning! These tasks need your attention today:\n\n' +
        rows.map((r) => `• ${r.key} · ${r.title} — ${r.overdue ? `overdue (${r.due})` : r.due}`).join('\n'),
    };
  },
  statusLabel: { TODO: 'To do', IN_PROGRESS: 'In progress', REVIEW: 'In review', DONE: 'Done', CANCELLED: 'Cancelled' },
  cta: { task: 'Open task', tasks: 'Open tasks' },
};

const ru: TaskCatalog = {
  assigned: (p) => ({
    title: `Вам назначена задача: ${p.key}`,
    body: `${p.actor} назначил(а) вам задачу.\n\n${p.key} · ${p.title}${dueLine('Срок', p.due)}`,
  }),
  status: (p) => ({
    title: `${p.key}: статус «${ru.statusLabel[p.status]}»`,
    body: `${p.actor} изменил(а) статус задачи «${p.title}»: ${ru.statusLabel[p.status]}.`,
  }),
  comment: (p) => ({
    title: `${p.key}: новый комментарий`,
    body: `${p.actor} оставил(а) комментарий к задаче «${p.title}».${quote(p.excerpt)}`,
  }),
  mention: (p) => ({
    title: `${p.actor} упомянул(а) вас (${p.key})`,
    body: `${p.actor} упомянул(а) вас в задаче «${p.title}».${quote(p.excerpt)}`,
  }),
  dueSoon: (p) => ({
    title: `Приближается срок: ${p.key}`,
    body: `Приближается срок задачи «${p.title}».\n\nСрок: ${p.due}`,
  }),
  dueNow: (p) => ({
    title: `Срок задачи наступил: ${p.key}`,
    body: `Срок задачи «${p.title}» наступает сейчас.\n\nСрок: ${p.due}`,
  }),
  overdue: (p) => ({
    title: `Задача просрочена: ${p.key}`,
    body: `Срок задачи «${p.title}» истёк, а задача ещё не выполнена.\n\nСрок был: ${p.due}`,
  }),
  digest: ({ rows }) => {
    const overdue = rows.filter((r) => r.overdue).length;
    return {
      title: `Ваши задачи на сегодня: ${rows.length}${overdue ? ` (просрочено: ${overdue})` : ''}`,
      body:
        'Доброе утро! Эти задачи требуют вашего внимания сегодня:\n\n' +
        rows.map((r) => `• ${r.key} · ${r.title} — ${r.overdue ? `просрочена (${r.due})` : r.due}`).join('\n'),
    };
  },
  statusLabel: { TODO: 'К выполнению', IN_PROGRESS: 'В работе', REVIEW: 'На проверке', DONE: 'Готово', CANCELLED: 'Отменена' },
  cta: { task: 'Открыть задачу', tasks: 'Открыть задачи' },
};

const catalogs: Record<Locale, TaskCatalog> = { az, de, en, ru };

export const taskTexts = (locale: Locale): TaskCatalog => catalogs[locale] ?? az;

// ─── Dates in notifications (Baku time; Azerbaijani month names are our own) ───

const AZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const INTL: Record<Exclude<Locale, 'az'>, string> = { de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baku',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "15 okt 2026, 18:00 (Bakı)" / "15. Okt. 2026, 18:00 (Baku)" — always in Baku time, labelled. */
export const formatTaskDue = (d: Date, locale: Locale) => {
  if (locale === 'az') {
    const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.day} ${AZ_MONTHS[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute} (Bakı)`;
  }
  const s = new Intl.DateTimeFormat(INTL[locale], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Baku',
  }).format(d);
  return `${s} (${locale === 'ru' ? 'Баку' : 'Baku'})`;
};

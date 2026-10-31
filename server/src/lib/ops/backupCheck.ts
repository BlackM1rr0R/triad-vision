import type { Locale } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';

/**
 * Weekly backup restore test — API side. The host script deploy/backup-verify.sh (cron, Sunday night) restores
 * the newest archive written by deploy/backup.sh into a throwaway MySQL container, runs sanity checks (tables
 * present, key tables not empty and close to the live row counts), removes the container and writes the
 * outcome into the Setting row `ops:backupCheck` of the live database (docker exec into the db container; no
 * HTTP endpoint, no token). This module:
 *
 *   - reads and validates that row (it comes from a shell script, so nothing in it is trusted blindly);
 *   - turns a NEW result into an admin notification (in-app + e-mail; a failure always e-mails, even to admins
 *     who turned e-mail notifications off), once per result (ReminderLog `backup-check:<checkedAt>`);
 *   - warns once when the last check is older than STALE_DAYS (the cron or the script stopped working);
 *   - serves the status card on the admin Security page (GET /api/admin/staff-ops/backup-check).
 */

export const BACKUP_CHECK_KEY = 'ops:backupCheck';
/** The script runs weekly; two missed runs' worth of slack before admins are warned. */
export const STALE_DAYS = 9;
const DAY = 24 * 60 * 60 * 1000;

const countSchema = z.object({ restored: z.number().int().min(0), live: z.number().int().min(0).nullable().optional() });

export const backupCheckSchema = z.object({
  status: z.enum(['ok', 'failed']),
  checkedAt: z.string().datetime(),
  backupFile: z.string().max(200).nullable().optional(),
  backupAt: z.string().datetime().nullable().optional(),
  tables: z.number().int().min(0).nullable().optional(),
  counts: z.record(z.string().max(64), countSchema).optional(),
  durationSec: z.number().min(0).nullable().optional(),
  error: z.string().max(500).nullable().optional(),
  host: z.string().max(100).nullable().optional(),
});
export type BackupCheck = z.infer<typeof backupCheckSchema>;

/** The last result, or null when the script never ran (or wrote something unreadable: logged, treated as missing). */
export const readBackupCheck = async (): Promise<BackupCheck | null> => {
  const row = await prisma.setting.findUnique({ where: { key: BACKUP_CHECK_KEY } });
  if (!row) return null;
  const parsed = backupCheckSchema.safeParse(row.value);
  if (!parsed.success) {
    console.error('[backup-check] unreadable result row', parsed.error.issues.slice(0, 3));
    return null;
  }
  return parsed.data;
};

export const isStale = (check: BackupCheck | null, now: Date) => !!check && now.getTime() - Date.parse(check.checkedAt) > STALE_DAYS * DAY;

export const backupCheckStatus = async (now = new Date()) => {
  const check = await readBackupCheck();
  return { check, stale: isStale(check, now), staleDays: STALE_DAYS, configured: !!check };
};

// ─── Notifications ──────────────────────────────────────────────────────

interface Txt {
  okTitle: string;
  ok: (file: string, tables: number | null) => string;
  failedTitle: string;
  failed: (file: string, error: string) => string;
  staleTitle: string;
  stale: (date: string, days: number) => string;
  cta: string;
}

const TEXTS: Record<Locale, Txt> = {
  az: {
    okTitle: 'Ehtiyat nüsxə yoxlandı: bərpa uğurludur',
    ok: (f, t) => `Ən son ehtiyat nüsxə (${f}) test bazasına bərpa edildi${t !== null ? `, ${t} cədvəl` : ''}; əsas cədvəllərin sətir sayları canlı bazaya uyğundur. Test bazası silindi.`,
    failedTitle: 'Ehtiyat nüsxənin yoxlanması ALINMADI',
    failed: (f, e) => `Ən son ehtiyat nüsxənin (${f}) test bərpası uğursuz oldu: ${e}\n\nServerdə /var/log/triad-backup-verify.log faylına baxın və ehtiyat nüsxələri təcili yoxlayın.`,
    staleTitle: 'Ehtiyat nüsxə artıq yoxlanmır',
    stale: (d, n) => `Son avtomatik bərpa testi ${d} tarixində olub (${n} gündən çox əvvəl). Serverdə cron işini (/etc/cron.d/triad-backup-verify) yoxlayın.`,
    cta: 'Vəziyyətə bax',
  },
  de: {
    okTitle: 'Backup geprüft: Wiederherstellung erfolgreich',
    ok: (f, t) => `Das neueste Backup (${f}) wurde testweise wiederhergestellt${t !== null ? ` (${t} Tabellen)` : ''}; die Zeilenzahlen der wichtigsten Tabellen passen zur Live-Datenbank. Die Testdatenbank wurde gelöscht.`,
    failedTitle: 'Backup-Prüfung FEHLGESCHLAGEN',
    failed: (f, e) => `Die Test-Wiederherstellung des neuesten Backups (${f}) ist fehlgeschlagen: ${e}\n\nBitte /var/log/triad-backup-verify.log auf dem Server prüfen und die Backups umgehend kontrollieren.`,
    staleTitle: 'Backups werden nicht mehr geprüft',
    stale: (d, n) => `Der letzte automatische Wiederherstellungstest war am ${d} (vor mehr als ${n} Tagen). Bitte den Cron-Job (/etc/cron.d/triad-backup-verify) auf dem Server prüfen.`,
    cta: 'Status ansehen',
  },
  en: {
    okTitle: 'Backup verified: restore succeeded',
    ok: (f, t) => `The latest backup (${f}) was restored into a throwaway database${t !== null ? ` (${t} tables)` : ''}; row counts of the key tables match the live database. The test database was removed.`,
    failedTitle: 'Backup verification FAILED',
    failed: (f, e) => `The test restore of the latest backup (${f}) failed: ${e}\n\nCheck /var/log/triad-backup-verify.log on the server and look at the backups urgently.`,
    staleTitle: 'Backups are no longer being verified',
    stale: (d, n) => `The last automatic restore test ran on ${d} (more than ${n} days ago). Check the cron job (/etc/cron.d/triad-backup-verify) on the server.`,
    cta: 'View status',
  },
  ru: {
    okTitle: 'Резервная копия проверена: восстановление успешно',
    ok: (f, t) => `Последняя резервная копия (${f}) восстановлена в тестовую базу${t !== null ? ` (${t} таблиц)` : ''}; количество строк ключевых таблиц совпадает с рабочей базой. Тестовая база удалена.`,
    failedTitle: 'Проверка резервной копии НЕ ПРОШЛА',
    failed: (f, e) => `Тестовое восстановление последней резервной копии (${f}) не удалось: ${e}\n\nПроверьте /var/log/triad-backup-verify.log на сервере и срочно проверьте резервные копии.`,
    staleTitle: 'Резервные копии больше не проверяются',
    stale: (d, n) => `Последний автоматический тест восстановления был ${d} (более ${n} дней назад). Проверьте cron-задачу (/etc/cron.d/triad-backup-verify) на сервере.`,
    cta: 'Открыть статус',
  },
};

const LINK = '/admin/security#backup-check';

const claim = async (key: string, now: Date) => {
  try {
    await prisma.reminderLog.create({ data: { key: key.slice(0, 191), sentAt: now } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

const admins = () => prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } });

/**
 * Hourly job body. Returns what it reported: 'ok' / 'failed' for a new result, 'stale' for the overdue warning,
 * null when there was nothing new.
 */
export const runBackupCheckNotify = async (now = new Date()): Promise<'ok' | 'failed' | 'stale' | null> => {
  const check = await readBackupCheck();
  if (!check) return null; // not set up on this host (dev, white-label instance without the cron)
  const file = check.backupFile || '—';
  if (await claim(`backup-check:${check.checkedAt}`, now)) {
    // A result older than the stale window (first deploy after a long pause) is not news any more.
    if (!isStale(check, now)) {
      const failed = check.status === 'failed';
      for (const a of await admins()) {
        const tx = TEXTS[a.locale];
        await notifyUser(a.id, {
          type: failed ? 'BACKUP_CHECK_FAILED' : 'BACKUP_CHECK_OK',
          title: failed ? tx.failedTitle : tx.okTitle,
          body: failed ? tx.failed(file, check.error || '—') : tx.ok(file, check.tables ?? null),
          link: LINK,
          ctaLabel: tx.cta,
          forceEmail: failed,
        });
      }
      return check.status;
    }
  }
  if (isStale(check, now) && (await claim(`backup-check-stale:${check.checkedAt}`, now))) {
    const date = check.checkedAt.slice(0, 10);
    for (const a of await admins()) {
      const tx = TEXTS[a.locale];
      await notifyUser(a.id, { type: 'BACKUP_CHECK_STALE', title: tx.staleTitle, body: tx.stale(date, STALE_DAYS), link: LINK, ctaLabel: tx.cta, forceEmail: true });
    }
    return 'stale';
  }
  return null;
};

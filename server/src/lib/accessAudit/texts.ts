/** Server texts of the Access Center › Audit module (az primary), keyed by locale. */
export type AuditLocale = 'az' | 'de' | 'en' | 'ru';

type F = Record<string, unknown>;
const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const s = (v: unknown) => (v == null ? '' : String(v));

export interface AuditTexts {
  reviewTitle: (quarter: string) => string;
  reviewBody: (items: number, breakGlass: number) => string;
  anomalyTitles: Record<string, string>;
  anomalySummary: Record<string, (f: F) => string>;
}

export const AUDIT_TEXTS: Record<AuditLocale, AuditTexts> = {
  az: {
    reviewTitle: (q) => `Girişlərin rüblük yoxlanışı: ${q}`,
    reviewBody: (i, b) => `${i} hesabın girişini təsdiqləyin və ya dəyişin. Rüb ərzində təcili giriş: ${b} dəfə.`,
    anomalyTitles: {
      accessManyRecords: 'Çox sayda müştəri/müraciət açılıb',
      accessManyReveals: 'Çox sayda gizli məlumat açılıb',
      accessManyExports: 'Çox sayda eksport',
      accessBreakGlass: 'Təcili giriş tez-tez istifadə olunur',
      accessOffHours: 'İş saatından kənar giriş',
      partnerManyIps: 'Partnyor girişi çox IP ünvanından',
    },
    anomalySummary: {
      accessManyRecords: (f) => `${s(f.account)}: 1 saatda ${n(f.records)} fərqli qeyd (hədd ${n(f.threshold)})`,
      accessManyReveals: (f) => `${s(f.account)}: bu gün ${n(f.reveals)} dəfə açıb (hədd ${n(f.threshold)})`,
      accessManyExports: (f) => `${s(f.account)}: bu gün ${n(f.exports)} eksport (hədd ${n(f.threshold)})`,
      accessBreakGlass: (f) => `${s(f.account)}: 7 gündə ${n(f.grants)} təcili giriş (hədd ${n(f.threshold)})`,
      accessOffHours: (f) => `${s(f.account)}: giriş saat ${s(f.hour)} (iş saatı ${s(f.window)})`,
      partnerManyIps: (f) => `${s(f.account)}: 24 saatda ${n(f.ips)} fərqli IP (hədd ${n(f.threshold)})`,
    },
  },
  de: {
    reviewTitle: (q) => `Quartalsweise Zugriffsprüfung: ${q}`,
    reviewBody: (i, b) => `Bitte den Zugriff von ${i} Konten bestätigen oder ändern. Notfallzugriffe im Quartal: ${b}.`,
    anomalyTitles: {
      accessManyRecords: 'Viele Kunden/Fälle geöffnet',
      accessManyReveals: 'Viele geschützte Daten aufgedeckt',
      accessManyExports: 'Viele Exporte',
      accessBreakGlass: 'Häufiger Notfallzugriff',
      accessOffHours: 'Zugriff außerhalb der Arbeitszeit',
      partnerManyIps: 'Partner-Login von vielen IP-Adressen',
    },
    anomalySummary: {
      accessManyRecords: (f) => `${s(f.account)}: ${n(f.records)} verschiedene Datensätze in 1 Stunde (Grenze ${n(f.threshold)})`,
      accessManyReveals: (f) => `${s(f.account)}: heute ${n(f.reveals)}-mal aufgedeckt (Grenze ${n(f.threshold)})`,
      accessManyExports: (f) => `${s(f.account)}: heute ${n(f.exports)} Exporte (Grenze ${n(f.threshold)})`,
      accessBreakGlass: (f) => `${s(f.account)}: ${n(f.grants)} Notfallzugriffe in 7 Tagen (Grenze ${n(f.threshold)})`,
      accessOffHours: (f) => `${s(f.account)}: Login um ${s(f.hour)} Uhr (Arbeitszeit ${s(f.window)})`,
      partnerManyIps: (f) => `${s(f.account)}: ${n(f.ips)} verschiedene IPs in 24 Stunden (Grenze ${n(f.threshold)})`,
    },
  },
  en: {
    reviewTitle: (q) => `Quarterly access review: ${q}`,
    reviewBody: (i, b) => `Please confirm or change the access of ${i} accounts. Emergency access used this quarter: ${b} times.`,
    anomalyTitles: {
      accessManyRecords: 'Many clients/cases opened',
      accessManyReveals: 'Many protected values revealed',
      accessManyExports: 'Many exports',
      accessBreakGlass: 'Frequent emergency access',
      accessOffHours: 'Access outside working hours',
      partnerManyIps: 'Partner login from many IP addresses',
    },
    anomalySummary: {
      accessManyRecords: (f) => `${s(f.account)}: ${n(f.records)} different records in 1 hour (limit ${n(f.threshold)})`,
      accessManyReveals: (f) => `${s(f.account)}: ${n(f.reveals)} reveals today (limit ${n(f.threshold)})`,
      accessManyExports: (f) => `${s(f.account)}: ${n(f.exports)} exports today (limit ${n(f.threshold)})`,
      accessBreakGlass: (f) => `${s(f.account)}: ${n(f.grants)} emergency accesses in 7 days (limit ${n(f.threshold)})`,
      accessOffHours: (f) => `${s(f.account)}: login at ${s(f.hour)}:00 (working hours ${s(f.window)})`,
      partnerManyIps: (f) => `${s(f.account)}: ${n(f.ips)} different IPs in 24 hours (limit ${n(f.threshold)})`,
    },
  },
  ru: {
    reviewTitle: (q) => `Ежеквартальная проверка доступа: ${q}`,
    reviewBody: (i, b) => `Подтвердите или измените доступ ${i} аккаунтов. Экстренный доступ за квартал: ${b} раз.`,
    anomalyTitles: {
      accessManyRecords: 'Открыто много клиентов/дел',
      accessManyReveals: 'Раскрыто много защищённых данных',
      accessManyExports: 'Много выгрузок',
      accessBreakGlass: 'Частый экстренный доступ',
      accessOffHours: 'Доступ вне рабочего времени',
      partnerManyIps: 'Вход партнёра со многих IP-адресов',
    },
    anomalySummary: {
      accessManyRecords: (f) => `${s(f.account)}: ${n(f.records)} разных записей за 1 час (порог ${n(f.threshold)})`,
      accessManyReveals: (f) => `${s(f.account)}: сегодня раскрыто ${n(f.reveals)} раз (порог ${n(f.threshold)})`,
      accessManyExports: (f) => `${s(f.account)}: сегодня ${n(f.exports)} выгрузок (порог ${n(f.threshold)})`,
      accessBreakGlass: (f) => `${s(f.account)}: ${n(f.grants)} экстренных доступов за 7 дней (порог ${n(f.threshold)})`,
      accessOffHours: (f) => `${s(f.account)}: вход в ${s(f.hour)}:00 (рабочее время ${s(f.window)})`,
      partnerManyIps: (f) => `${s(f.account)}: ${n(f.ips)} разных IP за 24 часа (порог ${n(f.threshold)})`,
    },
  },
};

export const auditText = (locale: string | null | undefined): AuditTexts =>
  AUDIT_TEXTS[(locale as AuditLocale) in AUDIT_TEXTS ? (locale as AuditLocale) : 'az'];

/** Title / summary of an access anomaly alert (used as fallback by the security alerts module). */
export const anomalyTitle = (rule: string, locale: string | null | undefined): string | undefined => auditText(locale).anomalyTitles[rule];
export const anomalySummary = (rule: string, facts: F, locale: string | null | undefined): string | undefined => auditText(locale).anomalySummary[rule]?.(facts);

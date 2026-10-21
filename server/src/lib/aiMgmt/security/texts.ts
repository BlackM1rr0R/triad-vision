import type { Locale } from '@prisma/client';
import type { RuleKey } from '../settings.js';

/** Titles and one-line fact summaries of the security alerts (notifications, e-mail, alert page). */

type Facts = Record<string, unknown>;
const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const who = (f: Facts) => s(f.account) || s(f.ip) || '—';

interface SecurityCopy {
  titles: Record<RuleKey, string>;
  describe: Record<RuleKey, (f: Facts) => string>;
  notifyTitle: (title: string) => string;
  open: string;
  severity: Record<'LOW' | 'MEDIUM' | 'HIGH', string>;
}

const az: SecurityCopy = {
  titles: {
    failedLoginsAccount: 'Bir hesaba çoxlu uğursuz giriş cəhdi',
    failedLoginsIp: 'Bir IP ünvanından çoxlu uğursuz giriş cəhdi',
    newIpLogin: 'Yeni şəbəkədən əməkdaş girişi',
    unusualHourLogin: 'Qeyri-adi saatda əməkdaş girişi',
    bulkDownload: 'Kütləvi yükləmə / ixrac',
    bulkDelete: 'Kütləvi silmə',
    twoFactorDisabled: 'İki mərhələli qoruma söndürülüb',
    roleEscalation: 'Rol yüksəldilib / yeni admin',
    apiKeyCreated: 'Yeni API açarı yaradılıb',
  },
  describe: {
    failedLoginsAccount: (f) => `${who(f)}: ${n(f.windowMinutes)} dəqiqədə ${n(f.attempts)} uğursuz cəhd, ${n(f.ips)} IP ünvanından.`,
    failedLoginsIp: (f) => `${s(f.ip)}: ${n(f.windowMinutes)} dəqiqədə ${n(f.attempts)} uğursuz cəhd, ${n(f.accounts)} hesab üçün.`,
    newIpLogin: (f) => `${who(f)} əvvəlki 30 gündə istifadə etmədiyi şəbəkədən daxil olub (${s(f.ip)}).`,
    unusualHourLogin: (f) => `${who(f)} saat ${s(f.hour)}-da daxil olub; adi giriş saatları: ${s(f.usualHours)}.`,
    bulkDownload: (f) => `${who(f)}: ${n(f.windowMinutes)} dəqiqədə ${n(f.files)} fayl yükləyib/ixrac edib, ${n(f.datasetExports)} tam ixrac.`,
    bulkDelete: (f) => `${who(f)}: ${n(f.windowMinutes)} dəqiqədə ${n(f.items)} element, ${n(f.accounts)} hesab/poçt qutusu silib.`,
    twoFactorDisabled: (f) => `${who(f)} hesabında iki mərhələli qoruma ${f.action === 'TWO_FACTOR_RESET' ? 'sıfırlanıb' : 'söndürülüb'}${s(f.by) ? ` (${s(f.by)})` : ''}.`,
    roleEscalation: (f) => `${who(f)}: yeni rol ${s(f.newRole)}${s(f.by) ? ` (${s(f.by)})` : ''}.`,
    apiKeyCreated: (f) => `${who(f)} API açarı yaradıb: "${s(f.keyName)}" (${n(f.keys) || 1}).`,
  },
  notifyTitle: (t) => `Təhlükəsizlik: ${t}`,
  open: 'Təhlükəsizlik xəbərdarlıqlarını aç',
  severity: { LOW: 'Aşağı', MEDIUM: 'Orta', HIGH: 'Yüksək' },
};

const de: SecurityCopy = {
  titles: {
    failedLoginsAccount: 'Viele fehlgeschlagene Anmeldungen bei einem Konto',
    failedLoginsIp: 'Viele fehlgeschlagene Anmeldungen von einer IP-Adresse',
    newIpLogin: 'Mitarbeiter-Anmeldung aus einem neuen Netz',
    unusualHourLogin: 'Mitarbeiter-Anmeldung zu ungewöhnlicher Uhrzeit',
    bulkDownload: 'Massen-Download / Export',
    bulkDelete: 'Massenlöschung',
    twoFactorDisabled: 'Zwei-Faktor-Schutz entfernt',
    roleEscalation: 'Rolle erhöht / neuer Admin',
    apiKeyCreated: 'Neuer API-Schlüssel erstellt',
  },
  describe: {
    failedLoginsAccount: (f) => `${who(f)}: ${n(f.attempts)} Fehlversuche in ${n(f.windowMinutes)} Minuten von ${n(f.ips)} IP-Adresse(n).`,
    failedLoginsIp: (f) => `${s(f.ip)}: ${n(f.attempts)} Fehlversuche in ${n(f.windowMinutes)} Minuten für ${n(f.accounts)} Konto/Konten.`,
    newIpLogin: (f) => `${who(f)} hat sich aus einem Netz angemeldet, das in den letzten 30 Tagen nicht genutzt wurde (${s(f.ip)}).`,
    unusualHourLogin: (f) => `${who(f)} hat sich um ${s(f.hour)} Uhr angemeldet; übliche Zeiten: ${s(f.usualHours)}.`,
    bulkDownload: (f) => `${who(f)}: ${n(f.files)} Dateien heruntergeladen/exportiert und ${n(f.datasetExports)} Komplett-Exporte in ${n(f.windowMinutes)} Minuten.`,
    bulkDelete: (f) => `${who(f)}: ${n(f.items)} Elemente und ${n(f.accounts)} Konten/Postfächer in ${n(f.windowMinutes)} Minuten gelöscht.`,
    twoFactorDisabled: (f) => `Beim Konto ${who(f)} wurde der Zwei-Faktor-Schutz ${f.action === 'TWO_FACTOR_RESET' ? 'zurückgesetzt' : 'deaktiviert'}${s(f.by) ? ` (${s(f.by)})` : ''}.`,
    roleEscalation: (f) => `${who(f)}: neue Rolle ${s(f.newRole)}${s(f.by) ? ` (${s(f.by)})` : ''}.`,
    apiKeyCreated: (f) => `${who(f)} hat einen API-Schlüssel erstellt: „${s(f.keyName)}“ (${n(f.keys) || 1}).`,
  },
  notifyTitle: (t) => `Sicherheit: ${t}`,
  open: 'Sicherheitswarnungen öffnen',
  severity: { LOW: 'Niedrig', MEDIUM: 'Mittel', HIGH: 'Hoch' },
};

const en: SecurityCopy = {
  titles: {
    failedLoginsAccount: 'Many failed logins for one account',
    failedLoginsIp: 'Many failed logins from one IP address',
    newIpLogin: 'Staff login from a new network',
    unusualHourLogin: 'Staff login at an unusual hour',
    bulkDownload: 'Bulk download / export',
    bulkDelete: 'Bulk deletion',
    twoFactorDisabled: 'Two-factor protection removed',
    roleEscalation: 'Role raised / new admin',
    apiKeyCreated: 'New API key created',
  },
  describe: {
    failedLoginsAccount: (f) => `${who(f)}: ${n(f.attempts)} failed attempts in ${n(f.windowMinutes)} minutes from ${n(f.ips)} IP address(es).`,
    failedLoginsIp: (f) => `${s(f.ip)}: ${n(f.attempts)} failed attempts in ${n(f.windowMinutes)} minutes for ${n(f.accounts)} account(s).`,
    newIpLogin: (f) => `${who(f)} logged in from a network not used in the previous 30 days (${s(f.ip)}).`,
    unusualHourLogin: (f) => `${who(f)} logged in at ${s(f.hour)}; usual hours: ${s(f.usualHours)}.`,
    bulkDownload: (f) => `${who(f)}: ${n(f.files)} files downloaded/exported and ${n(f.datasetExports)} full exports in ${n(f.windowMinutes)} minutes.`,
    bulkDelete: (f) => `${who(f)}: ${n(f.items)} items and ${n(f.accounts)} accounts/mailboxes deleted in ${n(f.windowMinutes)} minutes.`,
    twoFactorDisabled: (f) => `Two-factor protection of ${who(f)} was ${f.action === 'TWO_FACTOR_RESET' ? 'reset' : 'turned off'}${s(f.by) ? ` (${s(f.by)})` : ''}.`,
    roleEscalation: (f) => `${who(f)}: new role ${s(f.newRole)}${s(f.by) ? ` (${s(f.by)})` : ''}.`,
    apiKeyCreated: (f) => `${who(f)} created an API key: "${s(f.keyName)}" (${n(f.keys) || 1}).`,
  },
  notifyTitle: (t) => `Security: ${t}`,
  open: 'Open security alerts',
  severity: { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' },
};

const ru: SecurityCopy = {
  titles: {
    failedLoginsAccount: 'Много неудачных входов в один аккаунт',
    failedLoginsIp: 'Много неудачных входов с одного IP-адреса',
    newIpLogin: 'Вход сотрудника из новой сети',
    unusualHourLogin: 'Вход сотрудника в необычное время',
    bulkDownload: 'Массовое скачивание / экспорт',
    bulkDelete: 'Массовое удаление',
    twoFactorDisabled: 'Двухфакторная защита снята',
    roleEscalation: 'Повышение роли / новый админ',
    apiKeyCreated: 'Создан новый API-ключ',
  },
  describe: {
    failedLoginsAccount: (f) => `${who(f)}: ${n(f.attempts)} неудачных попыток за ${n(f.windowMinutes)} мин. с ${n(f.ips)} IP-адреса(ов).`,
    failedLoginsIp: (f) => `${s(f.ip)}: ${n(f.attempts)} неудачных попыток за ${n(f.windowMinutes)} мин. для ${n(f.accounts)} аккаунта(ов).`,
    newIpLogin: (f) => `${who(f)} вошёл(а) из сети, которая не использовалась последние 30 дней (${s(f.ip)}).`,
    unusualHourLogin: (f) => `${who(f)} вошёл(а) в ${s(f.hour)}; обычное время входа: ${s(f.usualHours)}.`,
    bulkDownload: (f) => `${who(f)}: скачано/экспортировано ${n(f.files)} файлов и ${n(f.datasetExports)} полных экспортов за ${n(f.windowMinutes)} мин.`,
    bulkDelete: (f) => `${who(f)}: удалено ${n(f.items)} элементов и ${n(f.accounts)} аккаунтов/ящиков за ${n(f.windowMinutes)} мин.`,
    twoFactorDisabled: (f) => `У аккаунта ${who(f)} двухфакторная защита ${f.action === 'TWO_FACTOR_RESET' ? 'сброшена' : 'отключена'}${s(f.by) ? ` (${s(f.by)})` : ''}.`,
    roleEscalation: (f) => `${who(f)}: новая роль ${s(f.newRole)}${s(f.by) ? ` (${s(f.by)})` : ''}.`,
    apiKeyCreated: (f) => `${who(f)} создал(а) API-ключ: «${s(f.keyName)}» (${n(f.keys) || 1}).`,
  },
  notifyTitle: (t) => `Безопасность: ${t}`,
  open: 'Открыть предупреждения безопасности',
  severity: { LOW: 'Низкая', MEDIUM: 'Средняя', HIGH: 'Высокая' },
};

export const SECURITY_TEXTS: Record<Locale, SecurityCopy> = { az, de, en, ru };

export const alertTitle = (rule: string, locale: Locale) => SECURITY_TEXTS[locale].titles[rule as RuleKey] ?? rule;
export const alertSummary = (rule: string, facts: Facts, locale: Locale) => {
  const fn = SECURITY_TEXTS[locale].describe[rule as RuleKey];
  return fn ? fn(facts) : '';
};

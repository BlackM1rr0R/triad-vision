import type { Locale } from '@prisma/client';

/** Texts of the document expiry warnings (client, assigned staff, daily admin digest). */

export interface ExpiryTextParams {
  doc: string;
  number: string;
  date: string;
  days: number;
  passport: boolean;
}

export interface DigestRow {
  client: string;
  number: string;
  doc: string;
  date: string;
  days: number;
  vault: boolean;
}

interface Catalog {
  client: (p: ExpiryTextParams) => { title: string; body: string };
  staff: (p: ExpiryTextParams & { client: string }) => { title: string; body: string };
  digest: (rows: DigestRow[], days: number) => { subject: string; body: string };
  cta: string;
  ctaAdmin: string;
}

const left = {
  az: (d: number) => (d <= 0 ? 'müddəti bitib' : `${d} gün qalıb`),
  de: (d: number) => (d <= 0 ? 'abgelaufen' : d === 1 ? 'noch 1 Tag' : `noch ${d} Tage`),
  en: (d: number) => (d <= 0 ? 'expired' : d === 1 ? '1 day left' : `${d} days left`),
  ru: (d: number) => (d <= 0 ? 'срок истёк' : `осталось ${d} дн.`),
};

const digestLines = (rows: DigestRow[], locale: Locale, vaultLabel: string) =>
  rows.map((r) => `• ${r.client} · ${r.number} · ${r.doc}${r.vault ? ` (${vaultLabel})` : ''} — ${r.date} (${left[locale](r.days)})`).join('\n');

export const EXPIRY_TEXTS: Record<Locale, Catalog> = {
  az: {
    client: (p) =>
      p.days <= 0
        ? { title: `Sənədin müddəti bitib: ${p.doc}`, body: `${p.number} müraciətinizdəki "${p.doc}" sənədinin etibarlılıq müddəti ${p.date} tarixində bitib.\n\nZəhmət olmasa yenilənmiş sənədi mümkün qədər tez kabinetinizdə yükləyin — etibarsız sənədlə müraciət davam edə bilməz.` }
        : { title: `Sənədin müddəti bitir: ${p.doc}`, body: `${p.number} müraciətinizdəki "${p.doc}" sənədinin etibarlılıq müddəti ${p.date} tarixində bitir (${p.days} gün qalıb).\n\n${p.passport ? 'Səfirlik və Şengen qaydalarına görə pasport səfərdən sonra da ən azı bir neçə ay etibarlı olmalıdır. ' : ''}Zəhmət olmasa sənədi vaxtında yeniləyin və yeni nüsxəni kabinetinizdə yükləyin.` },
    staff: (p) => ({ title: `${p.number}: sənədin müddəti ${p.days <= 0 ? 'bitib' : 'bitir'}`, body: `${p.client} — "${p.doc}" ${p.date} (${left.az(p.days)}).` }),
    digest: (rows, days) => ({ subject: `Müddəti ${days} gün ərzində bitən sənədlər (${rows.length})`, body: `Aktiv müraciətlərdə müddəti ${days} gün ərzində bitən və ya artıq bitmiş sənədlər:\n\n${digestLines(rows, 'az', 'anbar')}` }),
    cta: 'Sənədlərə bax',
    ctaAdmin: 'Admin paneldə aç',
  },
  de: {
    client: (p) =>
      p.days <= 0
        ? { title: `Dokument abgelaufen: ${p.doc}`, body: `Das Dokument „${p.doc}" in Ihrem Antrag ${p.number} ist am ${p.date} abgelaufen.\n\nBitte laden Sie so bald wie möglich ein gültiges Dokument in Ihrem Kundenbereich hoch – mit einem abgelaufenen Dokument kann der Antrag nicht weitergehen.` }
        : { title: `Dokument läuft ab: ${p.doc}`, body: `Das Dokument „${p.doc}" in Ihrem Antrag ${p.number} läuft am ${p.date} ab (${left.de(p.days)}).\n\n${p.passport ? 'Nach den Visa- und Schengen-Regeln muss der Reisepass auch nach der Reise noch einige Monate gültig sein. ' : ''}Bitte erneuern Sie es rechtzeitig und laden Sie die neue Fassung in Ihrem Kundenbereich hoch.` },
    staff: (p) => ({ title: `${p.number}: Dokument ${p.days <= 0 ? 'abgelaufen' : 'läuft ab'}`, body: `${p.client} — „${p.doc}" ${p.date} (${left.de(p.days)}).` }),
    digest: (rows, days) => ({ subject: `Dokumente, die in ${days} Tagen ablaufen (${rows.length})`, body: `Dokumente in laufenden Anträgen, die innerhalb von ${days} Tagen ablaufen oder bereits abgelaufen sind:\n\n${digestLines(rows, 'de', 'Safe')}` }),
    cta: 'Dokumente ansehen',
    ctaAdmin: 'Im Adminbereich öffnen',
  },
  en: {
    client: (p) =>
      p.days <= 0
        ? { title: `Document expired: ${p.doc}`, body: `"${p.doc}" in your application ${p.number} expired on ${p.date}.\n\nPlease upload a valid document in your account as soon as possible — the application cannot continue with an expired document.` }
        : { title: `Document expiring: ${p.doc}`, body: `"${p.doc}" in your application ${p.number} expires on ${p.date} (${left.en(p.days)}).\n\n${p.passport ? 'Under visa and Schengen rules your passport must stay valid for several months after the trip. ' : ''}Please renew it in time and upload the new copy in your account.` },
    staff: (p) => ({ title: `${p.number}: document ${p.days <= 0 ? 'expired' : 'expiring'}`, body: `${p.client} — "${p.doc}" ${p.date} (${left.en(p.days)}).` }),
    digest: (rows, days) => ({ subject: `Documents expiring within ${days} days (${rows.length})`, body: `Documents in open applications that expire within ${days} days or have already expired:\n\n${digestLines(rows, 'en', 'vault')}` }),
    cta: 'View documents',
    ctaAdmin: 'Open in admin',
  },
  ru: {
    client: (p) =>
      p.days <= 0
        ? { title: `Срок документа истёк: ${p.doc}`, body: `Срок действия документа «${p.doc}» в вашей заявке ${p.number} истёк ${p.date}.\n\nПожалуйста, как можно скорее загрузите действующий документ в личном кабинете — с недействительным документом заявка не может продолжаться.` }
        : { title: `Срок документа истекает: ${p.doc}`, body: `Срок действия документа «${p.doc}» в вашей заявке ${p.number} истекает ${p.date} (${left.ru(p.days)}).\n\n${p.passport ? 'По визовым и шенгенским правилам паспорт должен быть действителен ещё несколько месяцев после поездки. ' : ''}Пожалуйста, своевременно обновите его и загрузите новую копию в личном кабинете.` },
    staff: (p) => ({ title: `${p.number}: срок документа ${p.days <= 0 ? 'истёк' : 'истекает'}`, body: `${p.client} — «${p.doc}» ${p.date} (${left.ru(p.days)}).` }),
    digest: (rows, days) => ({ subject: `Документы, срок которых истекает в течение ${days} дней (${rows.length})`, body: `Документы в открытых заявках, срок которых истекает в течение ${days} дней или уже истёк:\n\n${digestLines(rows, 'ru', 'сейф')}` }),
    cta: 'Открыть документы',
    ctaAdmin: 'Открыть в админке',
  },
};

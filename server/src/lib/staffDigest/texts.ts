import type { Locale } from '@prisma/client';

/** Texts of the staff morning digest e-mail (lib/staffDigest), one catalogue per staff language. */

export type DigestSection = 'appointments' | 'overdue' | 'expiring' | 'new' | 'today';

export interface DigestTexts {
  subject: (day: string) => string;
  title: string;
  greeting: (firstName: string) => string;
  summary: (total: number) => string;
  sections: Record<DigestSection, string>;
  more: (n: number) => string;
  daysLeft: (n: number) => string;
  overdueSince: (date: string) => string;
  cta: string;
  optOut: string;
}

export const DIGEST_TEXTS: Record<Locale, DigestTexts> = {
  az: {
    subject: (d) => `Bu gün nə etməlisən · ${d}`,
    title: 'Bu gün nə etməlisən',
    greeting: (n) => `Sabahınız xeyir, ${n}!`,
    summary: (t) => `Bu gün sizi ${t} iş gözləyir. Ən vacibləri aşağıdadır.`,
    sections: {
      appointments: 'Bu günün görüşləri',
      overdue: 'Gecikmiş işlər',
      expiring: 'Müddəti bitən sənədlər',
      new: 'Yeni müraciətlər və təyinatlar',
      today: 'Bu gün bitməli olanlar',
    },
    more: (n) => `… və daha ${n}`,
    daysLeft: (n) => (n <= 0 ? 'müddəti bitib' : `${n} gün qalıb`),
    overdueSince: (d) => `müddət: ${d}`,
    cta: '"Bu günkü işlərim" səhifəsini aç',
    optOut: 'Bu e-poçtu admin panelində Təhlükəsizlik səhifəsində ("Səhər icmalı") söndürə bilərsiniz.',
  },
  de: {
    subject: (d) => `Ihr Tag heute · ${d}`,
    title: 'Was heute ansteht',
    greeting: (n) => `Guten Morgen, ${n}!`,
    summary: (t) => `Heute warten ${t} Aufgaben auf Sie. Das Wichtigste im Überblick:`,
    sections: {
      appointments: 'Termine heute',
      overdue: 'Überfällig',
      expiring: 'Bald ablaufende Dokumente',
      new: 'Neue Anfragen und Zuweisungen',
      today: 'Heute fällig',
    },
    more: (n) => `… und ${n} weitere`,
    daysLeft: (n) => (n <= 0 ? 'abgelaufen' : `noch ${n} Tage`),
    overdueSince: (d) => `fällig: ${d}`,
    cta: '„Meine Arbeit heute" öffnen',
    optOut: 'Sie können diese E-Mail im Admin-Bereich unter Sicherheit („Morgen-Übersicht") abbestellen.',
  },
  en: {
    subject: (d) => `Your day today · ${d}`,
    title: 'What to do today',
    greeting: (n) => `Good morning, ${n}!`,
    summary: (t) => `${t} items are waiting for you today. The most important ones:`,
    sections: {
      appointments: "Today's appointments",
      overdue: 'Overdue',
      expiring: 'Documents expiring soon',
      new: 'New inquiries and assignments',
      today: 'Due today',
    },
    more: (n) => `… and ${n} more`,
    daysLeft: (n) => (n <= 0 ? 'expired' : `${n} days left`),
    overdueSince: (d) => `due: ${d}`,
    cta: 'Open "My work today"',
    optOut: 'You can turn this e-mail off in the admin area under Security ("Morning digest").',
  },
  ru: {
    subject: (d) => `Ваш день сегодня · ${d}`,
    title: 'Что сделать сегодня',
    greeting: (n) => `Доброе утро, ${n}!`,
    summary: (t) => `Сегодня вас ждут дела: ${t}. Самое важное:`,
    sections: {
      appointments: 'Встречи сегодня',
      overdue: 'Просрочено',
      expiring: 'Документы с истекающим сроком',
      new: 'Новые заявки и назначения',
      today: 'Срок сегодня',
    },
    more: (n) => `… и ещё ${n}`,
    daysLeft: (n) => (n <= 0 ? 'срок истёк' : `осталось ${n} дн.`),
    overdueSince: (d) => `срок: ${d}`,
    cta: 'Открыть «Мои дела сегодня»',
    optOut: 'Это письмо можно отключить в админ-панели в разделе «Безопасность» («Утренняя сводка»).',
  },
};

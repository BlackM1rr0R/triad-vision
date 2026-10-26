import type { CourseLocale } from './service.js';

/** Notification and certificate texts of the pre-departure course, per content language. */

export const REMINDER: Record<CourseLocale, (p: { course: string }) => { title: string; body: string }> = {
  az: (p) => ({ title: 'Kursa davam edin', body: `"${p.course}" kursunda bir həftədir irəliləyiş yoxdur. Bir neçə dəqiqə ayırın və növbəti dərsə keçin — tamamladıqda sertifikat alacaqsınız.` }),
  de: (p) => ({ title: 'Machen Sie mit Ihrem Kurs weiter', body: `Im Kurs „${p.course}“ gab es seit einer Woche keinen Fortschritt. Nehmen Sie sich ein paar Minuten für die nächste Lektion – am Ende erhalten Sie ein Zertifikat.` }),
  en: (p) => ({ title: 'Continue your course', body: `There has been no progress in "${p.course}" for a week. Take a few minutes for the next lesson — you get a certificate when you finish.` }),
  ru: (p) => ({ title: 'Продолжите курс', body: `В курсе «${p.course}» уже неделю нет прогресса. Уделите несколько минут следующему уроку — по окончании вы получите сертификат.` }),
};

export const CERTIFICATE_READY: Record<CourseLocale, (p: { course: string }) => { title: string; body: string }> = {
  az: (p) => ({ title: 'Sertifikatınız hazırdır', body: `Təbriklər! "${p.course}" kursunu tamamladınız. Sertifikatı kabinetinizdən yükləyə bilərsiniz.` }),
  de: (p) => ({ title: 'Ihr Zertifikat ist fertig', body: `Glückwunsch! Sie haben den Kurs „${p.course}“ abgeschlossen. Das Zertifikat können Sie in Ihrem Konto herunterladen.` }),
  en: (p) => ({ title: 'Your certificate is ready', body: `Congratulations! You completed "${p.course}". You can download the certificate in your account.` }),
  ru: (p) => ({ title: 'Ваш сертификат готов', body: `Поздравляем! Вы прошли курс «${p.course}». Сертификат можно скачать в личном кабинете.` }),
};

export interface CertificateLabels {
  heading: string;
  sub: string;
  intro: string;
  completed: string;
  date: string;
  number: string;
  verify: string;
  note: string;
}

export const CERT_LABELS: Record<CourseLocale, CertificateLabels> = {
  az: {
    heading: 'SERTİFİKAT',
    sub: 'Kursun tamamlanması haqqında',
    intro: 'Bu sertifikat təsdiq edir ki,',
    completed: 'aşağıdakı kursu uğurla tamamlamışdır:',
    date: 'Tarix',
    number: 'Sertifikat №',
    verify: 'Yoxlama',
    note: 'Kurs ümumi məlumat xarakteri daşıyır və hüquqi məsləhət deyil.',
  },
  de: {
    heading: 'ZERTIFIKAT',
    sub: 'Teilnahmebestätigung',
    intro: 'Hiermit wird bestätigt, dass',
    completed: 'den folgenden Kurs erfolgreich abgeschlossen hat:',
    date: 'Datum',
    number: 'Zertifikat-Nr.',
    verify: 'Prüfen',
    note: 'Der Kurs vermittelt allgemeine Informationen und ist keine Rechtsberatung.',
  },
  en: {
    heading: 'CERTIFICATE',
    sub: 'of course completion',
    intro: 'This is to certify that',
    completed: 'has successfully completed the course:',
    date: 'Date',
    number: 'Certificate no.',
    verify: 'Verify',
    note: 'The course provides general information and is not legal advice.',
  },
  ru: {
    heading: 'СЕРТИФИКАТ',
    sub: 'о прохождении курса',
    intro: 'Настоящим подтверждается, что',
    completed: 'успешно прошёл(а) курс:',
    date: 'Дата',
    number: 'Сертификат №',
    verify: 'Проверка',
    note: 'Курс содержит общую информацию и не является юридической консультацией.',
  },
};

export const DATE_LOCALE: Record<CourseLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

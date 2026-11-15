import type { Locale } from '@prisma/client';

/** E-mail to the client with the login-free upload link, and the staff notice when files arrive. */
export const UPLOAD_LINK_MAIL: Record<Locale, { subject: string; title: string; body: (p: { items: string; days: number }) => string; cta: string }> = {
  az: {
    subject: 'Sənədlərinizi yükləyin',
    title: 'Sənədlərinizi link vasitəsilə yükləyin',
    body: (p) => `Müraciətiniz üçün aşağıdakı sənədlər lazımdır:\n${p.items}\n\nLinkdən giriş etmədən istifadə edə bilərsiniz. Link ${p.days} gün etibarlıdır. Linki başqası ilə paylaşmayın.`,
    cta: 'Sənədləri yüklə',
  },
  de: {
    subject: 'Bitte laden Sie Ihre Unterlagen hoch',
    title: 'Unterlagen per Link hochladen',
    body: (p) => `Für Ihren Antrag benötigen wir folgende Unterlagen:\n${p.items}\n\nDer Link funktioniert ohne Anmeldung und ist ${p.days} Tage gültig. Bitte geben Sie ihn nicht weiter.`,
    cta: 'Unterlagen hochladen',
  },
  en: {
    subject: 'Please upload your documents',
    title: 'Upload your documents via link',
    body: (p) => `For your application we need the following documents:\n${p.items}\n\nThe link works without logging in and is valid for ${p.days} days. Please do not share it.`,
    cta: 'Upload documents',
  },
  ru: {
    subject: 'Загрузите, пожалуйста, документы',
    title: 'Загрузка документов по ссылке',
    body: (p) => `Для вашего заявления нужны следующие документы:\n${p.items}\n\nСсылка работает без входа в кабинет и действует ${p.days} дн. Не передавайте её другим.`,
    cta: 'Загрузить документы',
  },
};

/** Staff notification (Azerbaijani: the team's working language). */
export const staffUploadNotice = (caseNumber: string, requirement: string, fileName: string) => ({
  title: `Linklə sənəd gəldi · ${caseNumber}`,
  body: `Müştəri yükləmə linki ilə fayl göndərdi: ${requirement} — ${fileName}`,
});

import type { SeoLocale } from '../seoCatalogue.js';
import type { AutoMissing } from './autoCheck.js';

/**
 * Client texts of the automatic sending (lib/germanyJobs/autoSend.ts) in the six site languages, and the German
 * e-mail to the employer. Azerbaijani wording follows docs/az-terminology.md (e-poçt, işəgötürən, kabinet, yükləyin).
 */

type T = Record<SeoLocale, string>;

/** Where the client fixes each item (site path; the language prefix is added for e-mails). */
export const FIX_PATH: Record<AutoMissing, string> = {
  ACCOUNT: '/register',
  CV: '/account/cv',
  GERMAN_LEVEL: '/account/profile',
  PROFESSION: '/account/profile',
  PASSPORT: '/account/profile',
  PHONE: '/account/profile',
  EMAIL: '/account/profile',
};

const ITEM: Record<AutoMissing, T> = {
  ACCOUNT: {
    az: 'Bu e-poçtla hesab yaradın və ya daxil olun. Profil, CV və pasport məlumatları kabinetdə saxlanılır.',
    de: 'Erstellen Sie mit dieser E-Mail-Adresse ein Konto oder melden Sie sich an. Profil, Lebenslauf und Passdaten werden dort gespeichert.',
    en: 'Create an account with this e-mail address or sign in. Your profile, CV and passport details are kept there.',
    ru: 'Создайте аккаунт с этим e-mail или войдите. Профиль, резюме и паспортные данные хранятся в личном кабинете.',
    tr: 'Bu e-posta adresiyle hesap oluşturun veya giriş yapın. Profil, özgeçmiş ve pasaport bilgileri orada saklanır.',
    uk: 'Створіть акаунт із цією e-mail-адресою або увійдіть. Профіль, резюме та паспортні дані зберігаються в особистому кабінеті.',
  },
  CV: {
    az: 'CV əlavə edin: faylı yükləyin və ya CV qurucusunda Lebenslauf hazırlayın.',
    de: 'Fügen Sie einen Lebenslauf hinzu: Datei hochladen oder im Lebenslauf-Editor erstellen.',
    en: 'Add a CV: upload a file or create your Lebenslauf in the CV builder.',
    ru: 'Добавьте резюме: загрузите файл или создайте Lebenslauf в конструкторе резюме.',
    tr: 'Özgeçmiş ekleyin: dosya yükleyin veya özgeçmiş oluşturucuda Lebenslauf hazırlayın.',
    uk: 'Додайте резюме: завантажте файл або створіть Lebenslauf у конструкторі резюме.',
  },
  GERMAN_LEVEL: {
    az: 'Alman dili səviyyəniz ({{have}}) elanın tələbindən ({{need}}) aşağıdır. Səviyyəniz artıbsa, profildə yeniləyin.',
    de: 'Ihr Deutschniveau ({{have}}) liegt unter dem der Anzeige ({{need}}). Wenn es inzwischen höher ist, ändern Sie es im Profil.',
    en: 'Your German level ({{have}}) is below what the listing asks for ({{need}}). If it has improved, update it in your profile.',
    ru: 'Ваш уровень немецкого ({{have}}) ниже требуемого в объявлении ({{need}}). Если он вырос, обновите его в профиле.',
    tr: 'Almanca seviyeniz ({{have}}) ilanın istediğinden ({{need}}) düşük. Seviyeniz yükseldiyse profilinizde güncelleyin.',
    uk: 'Ваш рівень німецької ({{have}}) нижчий за вимогу оголошення ({{need}}). Якщо він зріс, оновіть його в профілі.',
  },
  PROFESSION: {
    az: 'Peşəniz elana uyğun gəlmir. Profildə peşənizi yoxlayın. Düzdürsə, komandamız müraciətə özü baxacaq.',
    de: 'Ihr Beruf passt nicht zur Anzeige. Prüfen Sie den Beruf im Profil. Stimmt er, prüft unser Team die Bewerbung selbst.',
    en: 'Your profession does not match the listing. Check the profession in your profile. If it is correct, our team will review the application.',
    ru: 'Ваша профессия не совпадает с вакансией. Проверьте профессию в профиле. Если она указана верно, наша команда рассмотрит заявку сама.',
    tr: 'Mesleğiniz ilanla eşleşmiyor. Profilinizdeki mesleği kontrol edin. Doğruysa ekibimiz başvuruyu kendisi inceleyecek.',
    uk: 'Ваша професія не відповідає вакансії. Перевірте професію в профілі. Якщо вона вказана правильно, наша команда розгляне заявку сама.',
  },
  PASSPORT: {
    az: 'Pasport məlumatlarını əlavə edin: profildə pasport nömrəsini yazın və ya pasportun şəklini yükləyin.',
    de: 'Ergänzen Sie Ihre Passdaten: Passnummer im Profil eintragen oder den Pass hochladen.',
    en: 'Add your passport details: enter the passport number in your profile or upload your passport.',
    ru: 'Добавьте паспортные данные: укажите номер паспорта в профиле или загрузите паспорт.',
    tr: 'Pasaport bilgilerinizi ekleyin: profilinize pasaport numarasını yazın veya pasaportunuzu yükleyin.',
    uk: 'Додайте паспортні дані: вкажіть номер паспорта в профілі або завантажте паспорт.',
  },
  PHONE: {
    az: 'Profildə telefon nömrənizi yazın.',
    de: 'Tragen Sie Ihre Telefonnummer im Profil ein.',
    en: 'Enter your phone number in your profile.',
    ru: 'Укажите номер телефона в профиле.',
    tr: 'Profilinize telefon numaranızı yazın.',
    uk: 'Вкажіть номер телефону в профілі.',
  },
  EMAIL: {
    az: 'Profildə düzgün e-poçt ünvanı yazın.',
    de: 'Tragen Sie eine gültige E-Mail-Adresse im Profil ein.',
    en: 'Enter a valid e-mail address in your profile.',
    ru: 'Укажите действующий e-mail в профиле.',
    tr: 'Profilinize geçerli bir e-posta adresi yazın.',
    uk: 'Вкажіть дійсну e-mail-адресу в профілі.',
  },
};

const NEEDS_TITLE: T = {
  az: 'Müraciətiniz üçün məlumat çatışmır',
  de: 'Für Ihre Bewerbung fehlen noch Angaben',
  en: 'Your application needs a few more details',
  ru: 'Для вашей заявки не хватает данных',
  tr: 'Başvurunuz için bazı bilgiler eksik',
  uk: 'Для вашої заявки бракує даних',
};
const NEEDS_INTRO: T = {
  az: '"{{job}}" vakansiyasına müraciətinizi işəgötürənə avtomatik göndərmək üçün bunlar lazımdır:',
  de: 'Damit wir Ihre Bewerbung für „{{job}}“ automatisch an den Arbeitgeber senden können, fehlt noch:',
  en: 'To send your application for "{{job}}" to the employer automatically, we still need:',
  ru: 'Чтобы автоматически отправить вашу заявку на вакансию «{{job}}» работодателю, не хватает:',
  tr: '"{{job}}" ilanına başvurunuzu işverene otomatik göndermemiz için şunlar gerekiyor:',
  uk: 'Щоб автоматично надіслати вашу заявку на вакансію «{{job}}» роботодавцю, бракує:',
};
const NEEDS_OUTRO: T = {
  az: 'Məlumatları tamamlayan kimi sistem müraciəti yenidən yoxlayacaq və özü göndərəcək.',
  de: 'Sobald die Angaben vollständig sind, prüft das System die Bewerbung erneut und sendet sie automatisch.',
  en: 'As soon as the details are complete, the system checks the application again and sends it automatically.',
  ru: 'Как только данные будут заполнены, система снова проверит заявку и отправит её автоматически.',
  tr: 'Bilgiler tamamlanınca sistem başvuruyu yeniden kontrol eder ve otomatik olarak gönderir.',
  uk: 'Щойно дані будуть заповнені, система знову перевірить заявку й надішле її автоматично.',
};
const READY_TITLE: T = {
  az: 'Müraciətiniz hazırlanıb',
  de: 'Ihre Bewerbung ist vorbereitet',
  en: 'Your application is prepared',
  ru: 'Ваша заявка подготовлена',
  tr: 'Başvurunuz hazırlandı',
  uk: 'Вашу заявку підготовлено',
};
const READY_BODY: T = {
  az: '"{{job}}" vakansiyasına müraciətiniz hazırlanıb, işəgötürənə göndərilir. Göndərilən kimi sizə xəbər verəcəyik.',
  de: 'Ihre Bewerbung für „{{job}}“ ist vorbereitet und wird an den Arbeitgeber gesendet. Wir melden uns, sobald sie verschickt ist.',
  en: 'Your application for "{{job}}" is prepared and is being sent to the employer. We will let you know once it has been sent.',
  ru: 'Ваша заявка на вакансию «{{job}}» подготовлена и отправляется работодателю. Сообщим, как только она будет отправлена.',
  tr: '"{{job}}" ilanına başvurunuz hazırlandı, işverene gönderiliyor. Gönderilince size haber vereceğiz.',
  uk: 'Вашу заявку на вакансію «{{job}}» підготовлено, вона надсилається роботодавцю. Повідомимо, щойно її буде надіслано.',
};
const CTA_FIX: T = { az: 'Məlumatları tamamla', de: 'Angaben ergänzen', en: 'Complete details', ru: 'Заполнить данные', tr: 'Bilgileri tamamla', uk: 'Заповнити дані' };
const CTA_APPS: T = { az: 'Müraciətlərimə bax', de: 'Meine Bewerbungen', en: 'My applications', ru: 'Мои заявки', tr: 'Başvurularım', uk: 'Мої заявки' };

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => v[k] ?? '');
const prefix = (lng: SeoLocale) => (lng === 'az' ? '' : `/${lng}`);

export interface NeedsVars {
  job: string;
  have: string;
  need: string;
}

/** One line per missing item (also the timeline note the client sees). */
export const needsLines = (missing: readonly AutoMissing[], lng: SeoLocale, v: NeedsVars) => missing.map((c) => `• ${fill(ITEM[c][lng], { have: v.have, need: v.need })}`);

/**
 * Notification / e-mail listing exactly what is missing. `siteUrl` given (e-mail to a guest or the e-mail copy) →
 * every item carries its link.
 */
export const needsMessage = (missing: readonly AutoMissing[], lng: SeoLocale, v: NeedsVars, siteUrl?: string) => {
  const lines = missing.map((c) => {
    const text = `• ${fill(ITEM[c][lng], { have: v.have, need: v.need })}`;
    return siteUrl ? `${text}\n  ${siteUrl}${prefix(lng)}${FIX_PATH[c]}` : text;
  });
  return {
    title: `${NEEDS_TITLE[lng]} · ${v.job}`.slice(0, 190),
    body: `${fill(NEEDS_INTRO[lng], { job: v.job })}\n\n${lines.join('\n')}\n\n${NEEDS_OUTRO[lng]}`,
    note: `${NEEDS_TITLE[lng]}:\n${needsLines(missing, lng, v).join('\n')}`.slice(0, 1000),
    cta: CTA_FIX[lng],
    /** First place to fix (button / notification link). */
    path: FIX_PATH[missing[0] ?? 'CV'],
  };
};

export const readyMessage = (lng: SeoLocale, job: string) => ({ title: `${READY_TITLE[lng]} · ${job}`.slice(0, 190), body: fill(READY_BODY[lng], { job }), cta: CTA_APPS[lng] });

export const localePath = (lng: SeoLocale, path: string) => `${prefix(lng)}${path}`;

// ─── E-mail to the employer (German) ─────────────────────────────────────────

export const employerMail = (v: { applicant: string; title: string | null; company: string | null; listingUrl: string; subject: string; brandName: string; phone: string; domain: string }) => {
  const job = v.title ? `„${v.title}“` : 'Ihre Stellenanzeige';
  return {
    subject: v.subject,
    body: [
      'Sehr geehrte Damen und Herren,',
      `im Auftrag von ${v.applicant} senden wir Ihnen die Bewerbung auf ${job}${v.company ? ` (${v.company})` : ''}. Anschreiben und Lebenslauf finden Sie als PDF im Anhang.`,
      `${v.brandName} begleitet Fachkräfte aus Aserbaidschan auf dem Weg nach Deutschland. Der Bewerber hat der Weitergabe seiner Unterlagen an Sie zugestimmt.`,
      'Bei Interesse antworten Sie einfach auf diese E-Mail. Gern stimmen wir einen Termin für ein Vorstellungsgespräch (auch per Video) ab.',
      `Stellenanzeige: ${v.listingUrl}`,
      `Mit freundlichen Grüßen\n${v.brandName}${v.phone ? `\n${v.phone}` : ''}${v.domain ? ` · ${v.domain}` : ''}`,
    ].join('\n\n'),
  };
};

import type { SeoLocale } from '../seoCatalogue.js';
import type { AutoMissing } from './autoCheck.js';

/**
 * Client texts of the retired automatic sending (lib/germanyJobs/autoSend.ts) in the six site languages: FIX_PATH is still
 * read by the history view of earlier applications (routes/externalApplications.ts); the notices stay unit-tested.
 * Azerbaijani wording follows docs/az-terminology.md (e-poçt, işəgötürən, kabinet, yükləyin).
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
const CTA_FIX: T = { az: 'Məlumatları tamamla', de: 'Angaben ergänzen', en: 'Complete details', ru: 'Заполнить данные', tr: 'Bilgileri tamamla', uk: 'Заповнити дані' };

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

// ─── The client sends the package themselves (CLIENT_SEND) ───────────────────

const CLIENT_TITLE: T = {
  az: 'Müraciətiniz hazırdır. İşəgötürənə özünüz göndərin',
  de: 'Ihre Bewerbung ist fertig. Bitte senden Sie sie selbst an den Arbeitgeber',
  en: 'Your application is ready. Please send it to the employer yourself',
  ru: 'Ваша заявка готова. Отправьте её работодателю сами',
  tr: 'Başvurunuz hazır. Lütfen işverene kendiniz gönderin',
  uk: 'Вашу заявку готово. Надішліть її роботодавцю самостійно',
};
const CLIENT_BODY: T = {
  az: '"{{job}}" vakansiyasına Anschreiben və CV hazırdır. Bu işəgötürənin e-poçtu bizdə yoxdur. Kabinetdə addımlara baxın: elanı açın, paketi endirin, işəgötürənə göndərin. Sonra "Göndərdim" düyməsinə basın.',
  de: 'Anschreiben und Lebenslauf für „{{job}}“ sind fertig. Die E-Mail-Adresse dieses Arbeitgebers liegt uns nicht vor. Folgen Sie den Schritten in Ihrem Konto: Anzeige öffnen, Paket herunterladen, an den Arbeitgeber senden. Danach auf „Gesendet“ klicken.',
  en: 'The cover letter and CV for "{{job}}" are ready. We do not have this employer\'s e-mail address. Follow the steps in your account: open the listing, download the package, send it to the employer. Then press "I sent it".',
  ru: 'Сопроводительное письмо и резюме для вакансии «{{job}}» готовы. E-mail этого работодателя у нас нет. Следуйте шагам в личном кабинете: откройте объявление, скачайте пакет, отправьте работодателю. Затем нажмите «Я отправил(а)».',
  tr: '"{{job}}" ilanı için ön yazı ve özgeçmiş hazır. Bu işverenin e-posta adresi bizde yok. Hesabınızdaki adımları izleyin: ilanı açın, paketi indirin, işverene gönderin. Sonra "Gönderdim" düğmesine basın.',
  uk: 'Супровідний лист і резюме для вакансії «{{job}}» готові. E-mail цього роботодавця у нас немає. Виконайте кроки в особистому кабінеті: відкрийте оголошення, завантажте пакет, надішліть роботодавцю. Потім натисніть «Я надіслав(ла)».',
};
const REMIND_TITLE: T = {
  az: 'Xatırlatma: müraciətinizi göndərdinizmi?',
  de: 'Erinnerung: Haben Sie Ihre Bewerbung gesendet?',
  en: 'Reminder: have you sent your application?',
  ru: 'Напоминание: вы отправили заявку?',
  tr: 'Hatırlatma: başvurunuzu gönderdiniz mi?',
  uk: 'Нагадування: ви надіслали заявку?',
};
const REMIND_BODY: T = {
  az: '"{{job}}" vakansiyasına müraciətiniz hazırdır, amma hələ "Göndərdim" basılmayıb. Göndərmisinizsə, kabinetdə qeyd edin. Alınmırsa, "Alınmadı" düyməsinə basın. Komandamız kömək edəcək.',
  de: 'Ihre Bewerbung für „{{job}}“ ist fertig, aber noch nicht als gesendet markiert. Wenn Sie sie gesendet haben, markieren Sie das im Konto. Klappt es nicht, klicken Sie auf „Hat nicht geklappt“. Unser Team hilft.',
  en: 'Your application for "{{job}}" is ready but not marked as sent yet. If you have sent it, mark it in your account. If it does not work, press "It did not work". Our team will help.',
  ru: 'Ваша заявка на вакансию «{{job}}» готова, но ещё не отмечена как отправленная. Если вы её отправили, отметьте это в кабинете. Если не получается, нажмите «Не получилось». Наша команда поможет.',
  tr: '"{{job}}" ilanına başvurunuz hazır, ancak henüz gönderildi olarak işaretlenmedi. Gönderdiyseniz hesabınızda işaretleyin. Olmuyorsa "Olmadı" düğmesine basın. Ekibimiz yardım eder.',
  uk: 'Ваша заявка на вакансію «{{job}}» готова, але ще не позначена як надіслана. Якщо ви її надіслали, позначте це в кабінеті. Якщо не виходить, натисніть «Не вийшло». Наша команда допоможе.',
};
const CTA_STEPS: T = { az: 'Addımlara bax', de: 'Schritte ansehen', en: 'See the steps', ru: 'Посмотреть шаги', tr: 'Adımları gör', uk: 'Переглянути кроки' };

export const clientSendMessage = (lng: SeoLocale, job: string) => ({ title: `${CLIENT_TITLE[lng]} · ${job}`.slice(0, 190), body: fill(CLIENT_BODY[lng], { job }), cta: CTA_STEPS[lng] });
export const clientRemindMessage = (lng: SeoLocale, job: string) => ({ title: `${REMIND_TITLE[lng]} · ${job}`.slice(0, 190), body: fill(REMIND_BODY[lng], { job }), cta: CTA_STEPS[lng] });

/** Subject line the client copies: "Bewerbung als <title>". */
export const clientSubject = (title: string | null, fallback: string | null) => (title ? `Bewerbung als ${title.replace(/\s*\((?:m|w|d|f|x|div)(?:\s*\/\s*(?:m|w|d|f|x|div))*\)\s*/gi, ' ').trim()}` : fallback || 'Bewerbung').slice(0, 300);

/** Short German e-mail text the client copies into their own e-mail (Anschreiben + CV attached). */
export const clientCoverEmail = (v: { title: string | null; company: string | null; pageUrl: string; name: string; phone: string | null; email: string | null }) =>
  [
    'Sehr geehrte Damen und Herren,',
    `hiermit bewerbe ich mich auf Ihre Stellenanzeige${v.title ? ` „${v.title}“` : ''}${v.company ? ` bei ${v.company}` : ''}. Mein Anschreiben und meinen Lebenslauf finden Sie im Anhang als PDF.`,
    'Über eine Einladung zu einem Vorstellungsgespräch, gern auch per Video, freue ich mich sehr.',
    `Stellenanzeige: ${v.pageUrl}`,
    ['Mit freundlichen Grüßen', v.name, v.phone, v.email].filter(Boolean).join('\n'),
  ].join('\n\n');

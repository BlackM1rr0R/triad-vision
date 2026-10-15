import type { CaseStatus, Locale } from '@prisma/client';

/**
 * Texts for scheduled reminders and review invitations, in the recipient's language
 * (picked by `user.locale`). Candidates and staff both get their own locale.
 */

export type PassportLevel = '6m' | '3m' | 'expired';
export interface SlaRow {
  number: string;
  status: CaseStatus;
  days: number;
}

type Msg = { title: string; body: string };

interface GrowthCatalog {
  appointment: (p: { when: 'tomorrow' | 'today'; number: string; date: string; place: string }) => Msg;
  appointmentStaff: (p: { number: string; client: string; date: string; place: string }) => Msg;
  missingDocs: (p: { number: string; stage: 'INITIAL' | 'EMBASSY'; missing: string[] }) => Msg;
  missingDocsStaff: (p: { number: string; client: string; count: number; days: number }) => Msg;
  passport: (p: { level: PassportLevel; date: string }) => Msg;
  passportStaff: (p: { number: string; client: string; level: PassportLevel; date: string }) => Msg;
  slaDigest: (p: { rows: SlaRow[] }) => Msg;
  contractSign: (p: { number: string; days: number }) => Msg;
  reviewInvite: (p: { firstName: string }) => Msg;
  status: Partial<Record<CaseStatus, string>>;
  cta: { openCase: string; uploadDocs: string; profile: string; review: string; admin: string };
}

const list = (items: string[]) => items.map((x) => `• ${x}`).join('\n');

const az: GrowthCatalog = {
  appointment: (p) => ({
    title: p.when === 'today' ? 'Bu gün səfirlik görüşünüz var' : 'Sabah səfirlik görüşünüz var',
    body:
      `${p.when === 'today' ? 'Xatırlatma: səfirlik görüşünüz bu gündür.' : 'Xatırlatma: səfirlik görüşünüz sabahdır.'}\n\nTarix: ${p.date}\nYer: ${p.place}\nMüraciət: ${p.number}\n\n` +
      `Özünüzlə götürün:\n${list(['Pasportun orijinalı (və köhnə pasportlar, varsa)', 'Yüklədiyiniz bütün sənədlərin orijinalları', '2 biometrik foto', 'İmzalanmış iş təklifi / müqavilə', 'Tibbi sığorta', 'Görüş təsdiqi'])}\n\nZəhmət olmasa 15–20 dəqiqə tez gəlin.`,
  }),
  appointmentStaff: (p) => ({
    title: `${p.number}: sabah səfirlik görüşü`,
    body: `Namizəd: ${p.client}\nTarix: ${p.date}\nYer: ${p.place}\n\nNamizədin hazır olduğunu yoxlayın.`,
  }),
  missingDocs: (p) => ({
    title: p.stage === 'EMBASSY' ? 'Səfirlik sənədləri hələ yüklənməyib' : 'Sənədləriniz hələ tam deyil',
    body: `Müraciətinizin (${p.number}) davam etməsi üçün aşağıdakı mütləq sənədlər lazımdır:\n\n${list(p.missing)}\n\nZəhmət olmasa onları kabinetinizdə yükləyin. Sualınız varsa, menecerə yazın.`,
  }),
  missingDocsStaff: (p) => ({
    title: `${p.number}: namizəd sənədləri yükləmir`,
    body: `Namizəd ${p.client} ${p.days} gündür sənəd yükləməyib (çatışmayan mütləq sənədlər: ${p.count}). 3 xatırlatma göndərilib. Zəhmət olmasa namizədlə əlaqə saxlayın.`,
  }),
  passport: (p) => ({
    title: p.level === 'expired' ? 'Pasportunuzun müddəti bitib' : p.level === '3m' ? 'Pasportunuzun müddəti 3 aydan az qalıb' : 'Pasportunuzun müddəti 6 aydan az qalıb',
    body:
      (p.level === 'expired' ? `Pasportunuzun etibarlılıq müddəti ${p.date} tarixində bitib.` : `Pasportunuz ${p.date} tarixinə qədər etibarlıdır.`) +
      '\n\nViza üçün pasport Almaniyada qalacağınız bütün müddətdən sonra da etibarlı olmalıdır. Zəhmət olmasa vaxtında yeni pasport üçün müraciət edin və yeni tarixi profilinizdə yeniləyin.',
  }),
  passportStaff: (p) => ({
    title: `${p.number}: namizədin pasport müddəti`,
    body: `Namizəd ${p.client}: pasport ${p.level === 'expired' ? `${p.date} tarixində bitib` : `${p.date} tarixinə qədər etibarlıdır`}. Viza üçün müddətin kifayət etdiyini yoxlayın.`,
  }),
  slaDigest: (p) => ({
    title: `Gözləyən müraciətlər: ${p.rows.length}`,
    body: `Aşağıdakı müraciətlər sizin addımınızı gözləyir:\n\n${p.rows.map((r) => `• ${r.number} — ${az.status[r.status] ?? r.status}, ${r.days} gün`).join('\n')}`,
  }),
  contractSign: (p) => ({
    title: 'Müqavilə imzanızı gözləyir',
    body: `Müqavilə ${p.days} gündür kabinetinizdə imzanızı gözləyir (${p.number}). Zəhmət olmasa oxuyun və elektron imzalayın — bu bir neçə dəqiqə çəkir.`,
  }),
  reviewInvite: (p) => ({
    title: 'Təcrübənizi bölüşün',
    body: `Salam, ${p.firstName}!\n\nVizanız təsdiqləndi — sizi bir daha təbrik edirik. Triad Vision ilə təcrübəniz haqqında qısa rəy yazarsanız, çox şad olarıq. Bu, digər namizədlərə qərar verməyə kömək edir.\n\nRəy 2 dəqiqə çəkir. Link 60 gün etibarlıdır.`,
  }),
  status: { DOCUMENTS_REVIEW: 'sənəd yoxlaması', CONTRACT_SIGNED: 'imzanın təsdiqi', EMBASSY_REVIEW: 'səfirlik sənədlərinin yoxlanması', DECISION_PENDING: 'qərar gözlənilir' },
  cta: { openCase: 'Müraciəti aç', uploadDocs: 'Sənədləri yüklə', profile: 'Profili yenilə', review: 'Rəy yaz', admin: 'Admin paneldə aç' },
};

const de: GrowthCatalog = {
  appointment: (p) => ({
    title: p.when === 'today' ? 'Heute ist Ihr Botschaftstermin' : 'Morgen ist Ihr Botschaftstermin',
    body:
      `${p.when === 'today' ? 'Erinnerung: Ihr Termin bei der Botschaft ist heute.' : 'Erinnerung: Ihr Termin bei der Botschaft ist morgen.'}\n\nDatum: ${p.date}\nOrt: ${p.place}\nAntrag: ${p.number}\n\n` +
      `Bitte mitbringen:\n${list(['Original-Reisepass (und alte Pässe, falls vorhanden)', 'Originale aller hochgeladenen Dokumente', '2 biometrische Passfotos', 'Unterschriebenes Arbeitsangebot / Arbeitsvertrag', 'Krankenversicherungsnachweis', 'Terminbestätigung'])}\n\nBitte seien Sie 15–20 Minuten früher da.`,
  }),
  appointmentStaff: (p) => ({
    title: `${p.number}: morgen Botschaftstermin`,
    body: `Kandidat: ${p.client}\nDatum: ${p.date}\nOrt: ${p.place}\n\nBitte prüfen Sie, ob der Kandidat vorbereitet ist.`,
  }),
  missingDocs: (p) => ({
    title: p.stage === 'EMBASSY' ? 'Botschaftsunterlagen fehlen noch' : 'Ihre Unterlagen sind noch unvollständig',
    body: `Damit Ihr Antrag (${p.number}) weitergehen kann, fehlen noch diese Pflichtdokumente:\n\n${list(p.missing)}\n\nBitte laden Sie sie in Ihrem Kundenbereich hoch. Bei Fragen schreiben Sie Ihrem Betreuer.`,
  }),
  missingDocsStaff: (p) => ({
    title: `${p.number}: Kandidat lädt keine Dokumente hoch`,
    body: `${p.client} hat seit ${p.days} Tagen nichts hochgeladen (fehlende Pflichtdokumente: ${p.count}). 3 Erinnerungen wurden gesendet. Bitte kontaktieren Sie den Kandidaten.`,
  }),
  passport: (p) => ({
    title: p.level === 'expired' ? 'Ihr Reisepass ist abgelaufen' : p.level === '3m' ? 'Ihr Reisepass läuft in weniger als 3 Monaten ab' : 'Ihr Reisepass läuft in weniger als 6 Monaten ab',
    body:
      (p.level === 'expired' ? `Ihr Reisepass ist am ${p.date} abgelaufen.` : `Ihr Reisepass ist bis ${p.date} gültig.`) +
      '\n\nFür das Visum muss der Pass über die gesamte geplante Aufenthaltsdauer hinaus gültig sein. Bitte beantragen Sie rechtzeitig einen neuen Pass und aktualisieren Sie das Datum in Ihrem Profil.',
  }),
  passportStaff: (p) => ({
    title: `${p.number}: Reisepass des Kandidaten`,
    body: `${p.client}: Reisepass ${p.level === 'expired' ? `am ${p.date} abgelaufen` : `gültig bis ${p.date}`}. Bitte prüfen, ob die Gültigkeit für das Visum ausreicht.`,
  }),
  slaDigest: (p) => ({
    title: `Wartende Anträge: ${p.rows.length}`,
    body: `Diese Anträge warten auf Ihren nächsten Schritt:\n\n${p.rows.map((r) => `• ${r.number} — ${de.status[r.status] ?? r.status}, ${r.days} Tage`).join('\n')}`,
  }),
  contractSign: (p) => ({
    title: 'Ihr Vertrag wartet auf Ihre Unterschrift',
    body: `Der Vertrag liegt seit ${p.days} Tagen zur Unterschrift in Ihrem Kundenbereich (${p.number}). Bitte lesen und elektronisch unterschreiben — das dauert nur wenige Minuten.`,
  }),
  reviewInvite: (p) => ({
    title: 'Teilen Sie Ihre Erfahrung',
    body: `Hallo ${p.firstName},\n\nIhr Visum wurde erteilt — noch einmal herzlichen Glückwunsch! Wir freuen uns sehr über eine kurze Bewertung Ihrer Erfahrung mit Triad Vision. Sie hilft anderen Kandidaten bei ihrer Entscheidung.\n\nDas dauert 2 Minuten. Der Link ist 60 Tage gültig.`,
  }),
  status: { DOCUMENTS_REVIEW: 'Dokumentenprüfung', CONTRACT_SIGNED: 'Unterschrift bestätigen', EMBASSY_REVIEW: 'Prüfung Botschaftsunterlagen', DECISION_PENDING: 'Entscheidung ausstehend' },
  cta: { openCase: 'Antrag öffnen', uploadDocs: 'Dokumente hochladen', profile: 'Profil aktualisieren', review: 'Bewertung schreiben', admin: 'Im Adminbereich öffnen' },
};

const en: GrowthCatalog = {
  appointment: (p) => ({
    title: p.when === 'today' ? 'Your embassy appointment is today' : 'Your embassy appointment is tomorrow',
    body:
      `${p.when === 'today' ? 'Reminder: your embassy appointment is today.' : 'Reminder: your embassy appointment is tomorrow.'}\n\nDate: ${p.date}\nPlace: ${p.place}\nApplication: ${p.number}\n\n` +
      `Please bring:\n${list(['Original passport (and old passports, if any)', 'Originals of all documents you uploaded', '2 biometric photos', 'Signed job offer / employment contract', 'Health insurance', 'Appointment confirmation'])}\n\nPlease arrive 15–20 minutes early.`,
  }),
  appointmentStaff: (p) => ({
    title: `${p.number}: embassy appointment tomorrow`,
    body: `Candidate: ${p.client}\nDate: ${p.date}\nPlace: ${p.place}\n\nPlease check that the candidate is prepared.`,
  }),
  missingDocs: (p) => ({
    title: p.stage === 'EMBASSY' ? 'Embassy documents are still missing' : 'Your documents are still incomplete',
    body: `For your application (${p.number}) to move forward, these required documents are still missing:\n\n${list(p.missing)}\n\nPlease upload them in your account. If you have questions, message your manager.`,
  }),
  missingDocsStaff: (p) => ({
    title: `${p.number}: candidate is not uploading documents`,
    body: `${p.client} has not uploaded anything for ${p.days} days (missing required documents: ${p.count}). 3 reminders were sent. Please contact the candidate.`,
  }),
  passport: (p) => ({
    title: p.level === 'expired' ? 'Your passport has expired' : p.level === '3m' ? 'Your passport expires in less than 3 months' : 'Your passport expires in less than 6 months',
    body:
      (p.level === 'expired' ? `Your passport expired on ${p.date}.` : `Your passport is valid until ${p.date}.`) +
      '\n\nFor the visa, the passport must remain valid beyond your entire planned stay. Please apply for a new passport in time and update the date in your profile.',
  }),
  passportStaff: (p) => ({
    title: `${p.number}: candidate passport validity`,
    body: `${p.client}: passport ${p.level === 'expired' ? `expired on ${p.date}` : `valid until ${p.date}`}. Please check that the validity is sufficient for the visa.`,
  }),
  slaDigest: (p) => ({
    title: `Cases waiting: ${p.rows.length}`,
    body: `These cases are waiting for your next step:\n\n${p.rows.map((r) => `• ${r.number} — ${en.status[r.status] ?? r.status}, ${r.days} days`).join('\n')}`,
  }),
  contractSign: (p) => ({
    title: 'Your contract is waiting for your signature',
    body: `Your contract has been waiting for your signature for ${p.days} days (${p.number}). Please read it and sign electronically — it only takes a few minutes.`,
  }),
  reviewInvite: (p) => ({
    title: 'Share your experience',
    body: `Hello ${p.firstName},\n\nYour visa was approved — congratulations once more! We would be very glad if you wrote a short review of your experience with Triad Vision. It helps other candidates decide.\n\nIt takes 2 minutes. The link is valid for 60 days.`,
  }),
  status: { DOCUMENTS_REVIEW: 'document review', CONTRACT_SIGNED: 'confirm signature', EMBASSY_REVIEW: 'embassy documents review', DECISION_PENDING: 'decision pending' },
  cta: { openCase: 'Open application', uploadDocs: 'Upload documents', profile: 'Update profile', review: 'Write a review', admin: 'Open in admin panel' },
};

const ru: GrowthCatalog = {
  appointment: (p) => ({
    title: p.when === 'today' ? 'Сегодня у вас встреча в посольстве' : 'Завтра у вас встреча в посольстве',
    body:
      `${p.when === 'today' ? 'Напоминание: ваша встреча в посольстве сегодня.' : 'Напоминание: ваша встреча в посольстве завтра.'}\n\nДата: ${p.date}\nМесто: ${p.place}\nЗаявка: ${p.number}\n\n` +
      `Возьмите с собой:\n${list(['Оригинал паспорта (и старые паспорта, если есть)', 'Оригиналы всех загруженных документов', '2 биометрических фото', 'Подписанное предложение о работе / трудовой договор', 'Медицинская страховка', 'Подтверждение записи'])}\n\nПожалуйста, приходите за 15–20 минут.`,
  }),
  appointmentStaff: (p) => ({
    title: `${p.number}: завтра встреча в посольстве`,
    body: `Кандидат: ${p.client}\nДата: ${p.date}\nМесто: ${p.place}\n\nПроверьте, что кандидат готов.`,
  }),
  missingDocs: (p) => ({
    title: p.stage === 'EMBASSY' ? 'Документы для посольства ещё не загружены' : 'Ваши документы ещё не полные',
    body: `Чтобы заявка (${p.number}) продвигалась, не хватает обязательных документов:\n\n${list(p.missing)}\n\nПожалуйста, загрузите их в личном кабинете. Если есть вопросы, напишите менеджеру.`,
  }),
  missingDocsStaff: (p) => ({
    title: `${p.number}: кандидат не загружает документы`,
    body: `${p.client} не загружал документы ${p.days} дн. (не хватает обязательных: ${p.count}). Отправлено 3 напоминания. Пожалуйста, свяжитесь с кандидатом.`,
  }),
  passport: (p) => ({
    title: p.level === 'expired' ? 'Срок действия паспорта истёк' : p.level === '3m' ? 'Паспорт истекает менее чем через 3 месяца' : 'Паспорт истекает менее чем через 6 месяцев',
    body:
      (p.level === 'expired' ? `Срок действия вашего паспорта истёк ${p.date}.` : `Ваш паспорт действителен до ${p.date}.`) +
      '\n\nДля визы паспорт должен быть действителен дольше всего планируемого пребывания. Пожалуйста, заранее оформите новый паспорт и обновите дату в профиле.',
  }),
  passportStaff: (p) => ({
    title: `${p.number}: срок паспорта кандидата`,
    body: `${p.client}: паспорт ${p.level === 'expired' ? `истёк ${p.date}` : `действителен до ${p.date}`}. Проверьте, достаточно ли срока для визы.`,
  }),
  slaDigest: (p) => ({
    title: `Ожидающие заявки: ${p.rows.length}`,
    body: `Эти заявки ждут вашего следующего шага:\n\n${p.rows.map((r) => `• ${r.number} — ${ru.status[r.status] ?? r.status}, ${r.days} дн.`).join('\n')}`,
  }),
  contractSign: (p) => ({
    title: 'Договор ждёт вашей подписи',
    body: `Договор уже ${p.days} дн. ждёт вашей подписи в личном кабинете (${p.number}). Пожалуйста, прочитайте и подпишите его электронно — это займёт несколько минут.`,
  }),
  reviewInvite: (p) => ({
    title: 'Поделитесь опытом',
    body: `Здравствуйте, ${p.firstName}!\n\nВаша виза одобрена — ещё раз поздравляем! Будем очень рады короткому отзыву о работе с Triad Vision. Он поможет другим кандидатам принять решение.\n\nЭто займёт 2 минуты. Ссылка действительна 60 дней.`,
  }),
  status: { DOCUMENTS_REVIEW: 'проверка документов', CONTRACT_SIGNED: 'подтверждение подписи', EMBASSY_REVIEW: 'проверка документов для посольства', DECISION_PENDING: 'ожидание решения' },
  cta: { openCase: 'Открыть заявку', uploadDocs: 'Загрузить документы', profile: 'Обновить профиль', review: 'Написать отзыв', admin: 'Открыть в админ-панели' },
};

export const growthTexts: Record<Locale, GrowthCatalog> = { az, de, en, ru };

export const textsFor = (locale: Locale | string | null | undefined): GrowthCatalog =>
  growthTexts[(locale && locale in growthTexts ? locale : 'az') as Locale];

/** A calendar date (no time) in the user's language, e.g. for passport expiry. */
export const formatDay = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale], { dateStyle: 'long', timeZone: 'UTC' }).format(d);

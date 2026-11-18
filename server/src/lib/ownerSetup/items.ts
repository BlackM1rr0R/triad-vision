/**
 * Owner setup checklist (/admin/setup-checklist, ADMIN+): what the owner still has to do so the features of the
 * last weeks work. 'auto' items are detected from settings / the database (lib/ownerSetup/service.ts); 'manual'
 * items are marked "done" by hand. Every item can be marked "not needed". Optional items do not count towards the
 * progress. Texts: az first, then ru / en / de. Pure: no database here (unit-tested).
 */

export interface SetupText {
  az: string;
  ru: string;
  en: string;
  de: string;
}

export interface SetupItem {
  id: string;
  kind: 'auto' | 'manual';
  optional?: boolean;
  /** Admin page where it is done */
  link?: string;
  /** Outside source to check against */
  externalUrl?: string;
  title: SetupText;
  explain: SetupText;
}

export const SETUP_ITEMS: SetupItem[] = [
  {
    id: 'googleReview',
    kind: 'auto',
    link: '/admin/reviews',
    title: { az: 'Google rəy linki və avtomatik sorğular', ru: 'Ссылка на отзывы Google и автозапросы', en: 'Google review link and automation', de: 'Google-Bewertungslink und Automatik' },
    explain: {
      az: '"Rəylər" səhifəsində Google Business profilinizin "rəy yaz" linkini (və ya Place ID) daxil edin və avtomatik sorğuları yandırın. Bundan sonra razı müştərilər Google-a yönləndirilir.',
      ru: 'На странице «Отзывы» укажите ссылку «написать отзыв» вашего профиля Google Business (или Place ID) и включите автоматические запросы. После этого довольные клиенты направляются в Google.',
      en: 'On the Reviews page enter the "write a review" link of your Google Business Profile (or the Place ID) and switch on the automatic requests. Happy clients are then sent to Google.',
      de: 'Auf der Seite „Bewertungen“ den „Rezension schreiben“-Link des Google-Unternehmensprofils (oder die Place ID) eintragen und die automatischen Anfragen einschalten. Zufriedene Kunden werden dann zu Google geleitet.',
    },
  },
  {
    id: 'avvApproved',
    kind: 'auto',
    link: '/admin/trust',
    title: { az: 'AVV şablonu təsdiqlənib', ru: 'Шаблон AVV утверждён', en: 'AVV template approved', de: 'AVV-Vorlage freigegeben' },
    explain: {
      az: 'AVV (Auftragsverarbeitungsvertrag) işəgötürənlə məlumat emalı müqaviləsidir. Sistem yalnız şablon verir: əvvəlcə alman hüquqşünasına yoxlatdırın, sonra Trust səhifəsində təsdiqləyin. Təsdiqə qədər işəgötürənlər AVV-ni görmür.',
      ru: 'AVV (Auftragsverarbeitungsvertrag) — договор об обработке данных с работодателем. Система даёт только шаблон: сначала пусть его проверит немецкий юрист, затем утвердите на странице Trust. До этого работодатели AVV не видят.',
      en: 'The AVV (Auftragsverarbeitungsvertrag) is the data processing agreement with employers. The system only provides a template: have a German lawyer review it first, then approve it on the Trust page. Until then employers do not see it.',
      de: 'Der AVV (Auftragsverarbeitungsvertrag) mit Arbeitgebern ist nur eine Vorlage: zuerst anwaltlich prüfen lassen, dann auf der Trust-Seite freigeben. Bis dahin sehen Arbeitgeber ihn nicht.',
    },
  },
  {
    id: 'trustCenter',
    kind: 'auto',
    link: '/admin/trust',
    title: { az: 'Trust Center: yer, ehtiyat nüsxə, təhlükəsizlik e-poçtu', ru: 'Trust Center: место, бэкапы, e-mail безопасности', en: 'Trust Center: location, backups, security e-mail', de: 'Trust Center: Standort, Backups, Sicherheits-E-Mail' },
    explain: {
      az: 'Məlumatların saxlandığı yeri (hostinq müqaviləsinə görə təsdiqlənmiş), ehtiyat nüsxələrin yerini və təhlükəsizlik üçün əlaqə e-poçtunu yazın. Bunlar /trust səhifəsində işəgötürənlərə göstərilir.',
      ru: 'Укажите место хранения данных (подтверждённое по договору хостинга), место хранения резервных копий и e-mail для вопросов безопасности. Это показывается работодателям на странице /trust.',
      en: 'Enter the data location (confirmed against the hosting contract), where backups are kept and the security contact e-mail. Employers see these on the /trust page.',
      de: 'Datenstandort (laut Hosting-Vertrag bestätigt), Ort der Backups und Sicherheitskontakt eintragen. Arbeitgeber sehen das auf /trust.',
    },
  },
  {
    id: 'pastPlacements',
    kind: 'auto',
    link: '/admin/past-placements',
    title: { az: 'Keçmiş yerləşdirmələr daxil edilib', ru: 'Внесены прошлые трудоустройства', en: 'Past placements entered', de: 'Frühere Vermittlungen erfasst' },
    explain: {
      az: 'Sistemdən əvvəlki real yerləşdirmələri şəhər və peşə üzrə daxil edin. Onlar saytdakı xəritənin rəqəmlərinə əlavə olunur. Ən azı bir qeyd olmalıdır.',
      ru: 'Внесите реальные трудоустройства до системы по городам и профессиям. Они добавляются к цифрам карты на сайте. Нужна хотя бы одна запись.',
      en: 'Enter the real placements from before the system by city and profession. They are added to the public map numbers. At least one record is needed.',
      de: 'Echte Vermittlungen aus der Zeit vor dem System nach Stadt und Beruf erfassen. Sie fließen in die Karte ein. Mindestens ein Eintrag.',
    },
  },
  {
    id: 'homeStat',
    kind: 'manual',
    link: '/admin/content/stats',
    title: { az: '"500+" rəqəmi yoxlanılıb', ru: 'Цифра «500+» проверена', en: '"500+" home figure verified', de: 'Zahl „500+“ geprüft' },
    explain: {
      az: 'Ana səhifədəki "500+ yerləşdirilmiş işçi" kimi rəqəmlər real olmalıdır. Admin → Sayt → Statistika bölməsində yoxlayın və lazım olsa düzəldin, sonra "Hazırdır" basın.',
      ru: 'Цифры на главной, например «500+ трудоустроенных», должны быть реальными. Проверьте в Admin → Сайт → Статистика, при необходимости исправьте и нажмите «Готово».',
      en: 'Figures on the home page such as "500+ placed workers" must be real. Check them in Admin → Site → Statistics, fix them if needed, then press "Done".',
      de: 'Zahlen auf der Startseite wie „500+ vermittelte Fachkräfte“ müssen stimmen. Unter Admin → Website → Statistik prüfen, ggf. korrigieren und „Erledigt“ drücken.',
    },
  },
  {
    id: 'ezbPdf',
    kind: 'auto',
    link: '/admin/official-forms',
    externalUrl: 'https://www.arbeitsagentur.de/datei/erklaerung-zum-beschaeftigungsverhaeltnis_ba047549.pdf',
    title: { az: 'Rəsmi EzB PDF quraşdırılıb', ru: 'Официальный PDF EzB установлен', en: 'Official EzB PDF installed', de: 'Amtliches EzB-PDF installiert' },
    explain: {
      az: 'Bundesagentur für Arbeit saytından "Erklärung zum Beschäftigungsverhältnis" PDF-ini endirin və "Rəsmi formalar" səhifəsində aktiv şablon kimi yükləyin. Bundan sonra sistem formanı avtomatik doldura bilir.',
      ru: 'Скачайте PDF «Erklärung zum Beschäftigungsverhältnis» с сайта Bundesagentur für Arbeit и загрузите как активный шаблон на странице «Официальные формы». Тогда система сможет заполнять форму автоматически.',
      en: 'Download the "Erklärung zum Beschäftigungsverhältnis" PDF from the Bundesagentur für Arbeit and upload it as an active template on the Official forms page. The system can then fill the form automatically.',
      de: 'Das PDF „Erklärung zum Beschäftigungsverhältnis“ bei der Bundesagentur für Arbeit herunterladen und unter „Amtliche Formulare“ als aktive Vorlage hochladen. Dann kann das System es ausfüllen.',
    },
  },
  {
    id: 'tvToken',
    kind: 'auto',
    link: '/admin/tv-settings',
    title: { az: 'Ofis TV tokeni yaradılıb', ru: 'Создан токен офисного ТВ', en: 'Office TV token created', de: 'Büro-TV-Token erstellt' },
    explain: {
      az: 'Ofisdəki ekran üçün token yaradın və TV-də linki açın. Ofisdə ekran yoxdursa "Lazım deyil" seçin.',
      ru: 'Создайте токен для экрана в офисе и откройте ссылку на ТВ. Если экрана нет — выберите «Не нужно».',
      en: 'Create a token for the office screen and open the link on the TV. If there is no screen, choose "Not needed".',
      de: 'Ein Token für den Bürobildschirm anlegen und den Link am TV öffnen. Ohne Bildschirm „Nicht nötig“ wählen.',
    },
  },
  {
    id: 'packagePrices',
    kind: 'manual',
    link: '/admin/quotes',
    title: { az: 'Paket kataloqunun qiymətləri yoxlanılıb', ru: 'Цены каталога пакетов проверены', en: 'Package catalogue prices reviewed', de: 'Preise im Paketkatalog geprüft' },
    explain: {
      az: 'Admin → Təkliflər → Kataloq bölməsində qiymətlərin aktual olduğunu yoxlayın. Bu qiymətlər işəgötürən təkliflərində və paket konfiqurasiyasında istifadə olunur.',
      ru: 'В Admin → Предложения → Каталог проверьте актуальность цен. Они используются в предложениях работодателям и конфигураторе пакетов.',
      en: 'In Admin → Quotes → Catalogue check that the prices are current. They are used in employer quotes and the package configurator.',
      de: 'Unter Admin → Angebote → Katalog prüfen, ob die Preise aktuell sind. Sie fließen in Arbeitgeberangebote und den Paket-Konfigurator ein.',
    },
  },
  {
    id: 'studyProgrammes',
    kind: 'auto',
    link: '/admin/study',
    title: { az: 'Təhsil proqramları dərc edilib', ru: 'Учебные программы опубликованы', en: 'Study programmes published', de: 'Studiengänge veröffentlicht' },
    explain: {
      az: 'Kataloqdakı qaralama proqramları yoxlayın (son tarixlər, tələblər, linklər) və dərc edin. Qaralama qalan proqram saytda görünmür.',
      ru: 'Проверьте черновики программ в каталоге (сроки, требования, ссылки) и опубликуйте их. Черновики на сайте не видны.',
      en: 'Check the draft programmes in the catalogue (deadlines, requirements, links) and publish them. Drafts are not visible on the site.',
      de: 'Die Entwürfe im Katalog prüfen (Fristen, Voraussetzungen, Links) und veröffentlichen. Entwürfe sind auf der Website unsichtbar.',
    },
  },
  {
    id: 'privacyPolicy',
    kind: 'manual',
    link: '/admin/legal',
    title: { az: 'Məxfilik siyasəti yenilənib', ru: 'Политика конфиденциальности обновлена', en: 'Privacy policy updated', de: 'Datenschutzerklärung aktualisiert' },
    explain: {
      az: 'Siyasətdə yeni emallar qeyd olunmalıdır: tv_src mənbə kukisi, alət nəticələrinin e-poçtla göndərilməsi, valyuta məzənnəsi xəbərdarlıqları və Google rəy dəvətləri. Mətni hüquqşünasla razılaşdırın.',
      ru: 'В политике должны быть упомянуты новые обработки: cookie атрибуции tv_src, письма с результатами инструментов, уведомления о курсе валют и приглашения к отзывам Google. Согласуйте текст с юристом.',
      en: 'The policy must mention the new processing: the tv_src attribution cookie, tool result e-mails, exchange rate alerts and Google review invitations. Agree the text with a lawyer.',
      de: 'Die Erklärung muss die neuen Verarbeitungen nennen: Attributions-Cookie tv_src, Ergebnis-E-Mails der Tools, Wechselkurs-Alarme und Einladungen zu Google-Bewertungen. Text anwaltlich abstimmen.',
    },
  },
  {
    id: 'dataFreshness',
    kind: 'auto',
    link: '/admin/data-freshness',
    title: { az: 'Məlumatların aktuallığı yoxlanılıb', ru: 'Актуальность данных проверена', en: 'Data freshness items reviewed', de: 'Datenaktualität geprüft' },
    explain: {
      az: 'Vaxtı keçmiş bənd olmamalıdır. Hər bəndi rəsmi mənbə ilə yoxlayın, lazım olsa kodu düzəldin və "Yoxlandı" basın.',
      ru: 'Не должно быть просроченных пунктов. Проверьте каждый по официальному источнику, при необходимости исправьте код и нажмите «Проверено».',
      en: 'No item may be overdue. Check each against its official source, fix the code if needed and press "Reviewed".',
      de: 'Kein Punkt darf überfällig sein. Jeden mit der amtlichen Quelle abgleichen, ggf. Code anpassen und „Geprüft“ drücken.',
    },
  },
  {
    id: 'nativeReview',
    kind: 'manual',
    link: '/admin/translations',
    title: { az: 'Doğma dil yoxlaması', ru: 'Проверка носителем языка', en: 'Native-speaker review', de: 'Prüfung durch Muttersprachler' },
    explain: {
      az: '"Günün ifadəsi", Novruz təbrikləri və türk / ukrayna dilindəki bələdçilər doğma dil daşıyıcısı tərəfindən oxunmalıdır. Səhvləri "Tərcümələr" səhifəsində düzəldin.',
      ru: '«Фраза дня», поздравления с Новрузом и гайды на турецком / украинском должен прочитать носитель языка. Ошибки исправьте на странице «Переводы».',
      en: 'The phrase of the day, the Novruz greetings and the Turkish / Ukrainian guides should be read by a native speaker. Fix mistakes on the Translations page.',
      de: '„Satz des Tages“, Novruz-Grüße und die türkischen / ukrainischen Ratgeber sollte ein Muttersprachler lesen. Fehler unter „Übersetzungen“ korrigieren.',
    },
  },
  {
    id: 'searchConsole',
    kind: 'auto',
    link: '/admin/search-performance',
    title: { az: 'Search Console qoşulub', ru: 'Search Console подключён', en: 'Search Console connected', de: 'Search Console verbunden' },
    explain: {
      az: 'Google Search Console xidmət hesabı serverin tənzimləmələrinə əlavə edilməlidir (GSC_SITE_URL və GSC_SERVICE_ACCOUNT_JSON). Bunu server administratoru edir; sonra "Axtarış nəticələri" səhifəsi rəqəmləri göstərir.',
      ru: 'Сервисный аккаунт Google Search Console нужно добавить в настройки сервера (GSC_SITE_URL и GSC_SERVICE_ACCOUNT_JSON). Это делает администратор сервера; после этого страница «Поиск» показывает данные.',
      en: 'The Google Search Console service account must be added to the server settings (GSC_SITE_URL and GSC_SERVICE_ACCOUNT_JSON). The server administrator does this; then the Search performance page shows data.',
      de: 'Das Dienstkonto der Google Search Console muss in die Server-Einstellungen (GSC_SITE_URL und GSC_SERVICE_ACCOUNT_JSON). Das erledigt der Server-Admin; danach zeigt „Suchleistung“ Daten.',
    },
  },
  {
    id: 'arrivalCardEmbassy',
    kind: 'manual',
    externalUrl: 'https://berlin.mfa.gov.az',
    title: { az: 'Gəliş kartında səfirlik ünvanı təsdiqlənib', ru: 'Адрес посольства на карте прибытия подтверждён', en: 'Embassy address on the arrival card confirmed', de: 'Botschaftsadresse auf der Ankunftskarte bestätigt' },
    explain: {
      az: 'Gəliş kartında Azərbaycanın Berlindəki səfirliyinin konsulluq şöbəsi göstərilir: Hubertusallee 43, 14193 Berlin. Mənbələr fərqli ünvan verir — səfirliyə zəng edib və ya saytında yoxlayın.',
      ru: 'На карте прибытия указан консульский отдел посольства Азербайджана в Берлине: Hubertusallee 43, 14193 Berlin. Источники дают разные адреса — проверьте звонком или на сайте посольства.',
      en: 'The arrival card shows the consular section of the Azerbaijani embassy in Berlin: Hubertusallee 43, 14193 Berlin. Sources give different addresses — confirm by phone or on the embassy website.',
      de: 'Die Ankunftskarte zeigt die Konsularabteilung der aserbaidschanischen Botschaft in Berlin: Hubertusallee 43, 14193 Berlin. Quellen nennen unterschiedliche Adressen — telefonisch oder auf der Botschaftsseite bestätigen.',
    },
  },
  {
    id: 'apiKeyFiles',
    kind: 'manual',
    title: { az: 'Yükləmələrdəki açar fayllarını silin', ru: 'Удалите файлы ключей из «Загрузок»', en: 'Delete key files from Downloads', de: 'Schlüsseldateien aus „Downloads“ löschen' },
    explain: {
      az: 'Xatırlatma: kompüterinizin "Yükləmələr" qovluğunda qalan API açarı / xidmət hesabı fayllarını (məs. .json) silin və səbəti boşaldın. Açarlar artıq serverdədir.',
      ru: 'Напоминание: удалите оставшиеся в папке «Загрузки» файлы API-ключей / сервисных аккаунтов (например, .json) и очистите корзину. Ключи уже на сервере.',
      en: 'Reminder: delete leftover API key / service account files (e.g. .json) from your Downloads folder and empty the bin. The keys are already on the server.',
      de: 'Erinnerung: übrig gebliebene API-Schlüssel- / Dienstkonto-Dateien (z. B. .json) aus „Downloads“ löschen und den Papierkorb leeren. Die Schlüssel liegen bereits auf dem Server.',
    },
  },
  {
    id: 'jooble',
    kind: 'manual',
    optional: true,
    link: '/admin/job-channels',
    title: { az: 'Jooble icazəsi (istəyə bağlı)', ru: 'Разрешение Jooble (по желанию)', en: 'Jooble permission (optional)', de: 'Jooble-Freigabe (optional)' },
    explain: {
      az: 'Almaniya iş axtarışına Jooble elanlarını əlavə etmək üçün Jooble-dan API açarı və icazə lazımdır. Lazım deyilsə, bu addımı ötürün.',
      ru: 'Чтобы добавить вакансии Jooble в поиск работы в Германии, нужны API-ключ и разрешение Jooble. Если не нужно — пропустите.',
      en: 'To add Jooble listings to the Germany job search you need an API key and permission from Jooble. Skip it if not needed.',
      de: 'Für Jooble-Anzeigen in der Jobsuche Deutschland braucht es einen API-Schlüssel und die Freigabe von Jooble. Sonst überspringen.',
    },
  },
];

export type SetupState = 'done' | 'notNeeded' | 'open';
export interface SetupSignal {
  ok: boolean;
  /** facts for the UI, e.g. { drafts: 8 } or { missing: 'backupLocation,securityEmail' } */
  detail?: Record<string, string | number | boolean>;
}
export interface SetupMarkIn {
  itemId: string;
  state: string;
  note: string | null;
  markedByName: string;
  markedAt: Date;
}

/** Pure: status of every item from the auto signals and the manual marks, with the progress. */
export const evaluateSetup = (signals: Record<string, SetupSignal | undefined>, marks: SetupMarkIn[]) => {
  const markOf = new Map(marks.map((m) => [m.itemId, m]));
  const items = SETUP_ITEMS.map((item) => {
    const mark = markOf.get(item.id) ?? null;
    const signal = item.kind === 'auto' ? (signals[item.id] ?? { ok: false }) : null;
    let state: SetupState = 'open';
    if (mark?.state === 'notNeeded') state = 'notNeeded';
    else if (item.kind === 'auto' ? signal!.ok : mark?.state === 'done') state = 'done';
    return {
      ...item,
      state,
      detail: signal?.detail ?? null,
      mark: mark ? { state: mark.state, note: mark.note, by: mark.markedByName, at: mark.markedAt.toISOString() } : null,
    };
  });
  const counted = items.filter((i) => !i.optional);
  const resolved = counted.filter((i) => i.state !== 'open').length;
  const percent = counted.length ? Math.round((resolved / counted.length) * 100) : 100;
  return { items, resolved, total: counted.length, percent, complete: resolved === counted.length };
};

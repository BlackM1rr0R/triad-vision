/**
 * Texts of the printable Germany pocket guide (lib/pocketGuide/pdf.ts) in az / ru / en / de. Figures are never typed
 * here: they come in through `PocketFacts` from the verified constants (budget/params.ts: minimum wage and
 * Deutschlandticket by date; departure/arrivalCard.ts: emergency numbers and the embassy) so the booklet follows them.
 *
 * Legal basis (gesetze-im-internet.de, checked 2026-11-22): Anmeldung within two weeks (§ 17 BMG), landlord's
 * confirmation (§ 19 BMG); working time max. 8 h (up to 10 h with averaging, § 3 ArbZG), breaks 30 min after more
 * than 6 h / 45 min after more than 9 h (§ 4 ArbZG), 11 h rest (§ 5 ArbZG); minimum leave 24 working days on a 6-day
 * week = 20 days on a 5-day week (§ 3 BUrlG); sick note when ill for more than three calendar days (§ 5 EntgFG), pay
 * continued up to six weeks (§ 3 EntgFG); payslip (§ 108 GewO); deposit max. three net rents, payable in three
 * instalments (§ 551 BGB); service-charge statement within 12 months (§ 556 Abs. 3 BGB); prescription co-payment 10 %,
 * min. 5 €, max. 10 € (§ 61 SGB V); one-way deposit at least 0.25 € (§ 31 VerpackG). Card blocking 116 116:
 * Sperr-Notruf 116 116 e.V. (sperr-notruf.de). Rundfunkbeitrag 18.36 €/month per flat (budget/params.ts).
 */

/** Date the texts and figures were last checked against the sources (printed as "as of"; also shown by the client page). */
export const POCKET_GUIDE_CHECKED = '2026-11-22';

export const POCKET_LOCALES = ['az', 'ru', 'en', 'de'] as const;
export type PocketLocale = (typeof POCKET_LOCALES)[number];

export interface PocketFacts {
  /** "13,90 €" */
  minWage: string;
  minWageFrom: string;
  /** next decided step, "14,60 € (01.01.2027)" or null */
  minWageNext: string | null;
  ticket: string;
  ticketNext: string | null;
  rundfunk: string;
  /** dd.mm.yyyy */
  asOf: string;
  brand: string;
  phone: string;
  domain: string;
}

export interface Section {
  title: string;
  intro?: string;
  items: string[];
  /** checkboxes instead of bullets */
  check?: boolean;
  note?: string;
}

export interface PocketText {
  language: string;
  title: string;
  subtitle: string;
  preparedFor: string;
  edition: (asOf: string) => string;
  page: string;
  emergency: {
    title: string;
    rows: { number: string; label: string; note: string }[];
    embassy: string;
    consular: string;
    support: string;
    myEmployer: string;
    sayHelp: string;
  };
  firstDays: Section;
  buergeramt: string;
  phrasesTitle: (part: number) => string;
  phrasesIntro: string;
  waste: Section;
  tickets: Section;
  work: Section;
  doctor: Section;
  rent: Section;
  money: Section;
  links: { title: string; intro: string; website: string; phone: string };
  notesTitle: string;
  contactsTitle: string;
  contactFields: string[];
  back: { title: string; disclaimer: string; sources: string; estimate: string };
}

export const POCKET_TEXT = (f: PocketFacts): Record<PocketLocale, PocketText> => ({
  az: {
    language: 'Azərbaycanca',
    title: 'Almaniya cib bələdçisi',
    subtitle: 'İlk həftələr üçün ən vacib nömrələr, addımlar və ifadələr',
    preparedFor: 'Kim üçün',
    edition: (d) => `Vəziyyət: ${d}`,
    page: 'səh.',
    emergency: {
      title: 'Təcili nömrələr',
      rows: [
        { number: '112', label: 'Yanğın və təcili tibbi yardım', note: 'Həyat təhlükəsi, yanğın, ağır qəza. Pulsuzdur.' },
        { number: '110', label: 'Polis', note: 'Oğurluq, hücum, yol qəzası. Pulsuzdur.' },
        { number: '116 117', label: 'Növbətçi həkim', note: 'Təcili olmayan xəstəlik — gecə, həftəsonu, bayram; həkim qəbulu tapmağa da kömək edir.' },
        { number: '116 116', label: 'Bank kartını bloklamaq', note: 'Sperr-Notruf, gecə-gündüz. Xaricdən: +49 116 116. Bu nömrə sizə özü zəng etmir!' },
      ],
      embassy: 'Azərbaycanın Berlindəki səfirliyi',
      consular: 'Konsulluq şöbəsi',
      support: 'Triad Vision dəstək',
      myEmployer: 'Mənim işəgötürənim',
      sayHelp: 'Deyin: „Ich brauche Hilfe. Meine Adresse ist …“ — Köməyə ehtiyacım var. Ünvanım …',
    },
    firstDays: {
      title: 'İlk 14 gün: yoxlama siyahısı',
      check: true,
      items: [
        'Anmeldung: köçdükdən sonra 2 həftə ərzində Bürgeramt-da qeydiyyat. Pasport və ev sahibinin təsdiqi (Wohnungsgeberbestätigung) götürün.',
        'Meldebescheinigung (qeydiyyat arayışı) saxlayın — bank, işəgötürən və Ausländerbehörde istəyəcək.',
        'Tibbi sığorta (Krankenkasse): ilk iş günündən əvvəl dövlət kassasını seçin, üzvlük arayışını işəgötürənə verin.',
        'Bank hesabı (Girokonto): maaş üçün lazımdır; IBAN-ı işəgötürənə bildirin.',
        'Steuer-ID: qeydiyyatdan bir neçə həftə sonra poçtla gəlir — işəgötürənə verin. Gəlməyibsə, BZSt-dən soruşun.',
        'Sosial sığorta nömrəsi: adətən Krankenkasse/işəgötürən vasitəsilə, Deutsche Rentenversicherung poçtla göndərir.',
        'Vizanın bitmə tarixini yoxlayın və Ausländerbehörde-də yaşayış icazəsi üçün vaxtında termin alın.',
        `Rundfunkbeitrag: mənzil üçün ayda ${f.rundfunk} — mənzildə heç kim ödəmirsə, qeydiyyatdan keçin.`,
        'SIM kart (şəxsiyyət yoxlaması ilə), şəxsi məsuliyyət sığortası (Haftpflicht) tövsiyə olunur.',
      ],
    },
    buergeramt: 'Sizin Bürgeramt',
    phrasesTitle: (p) => `40 vacib ifadə (${p}/3)`,
    phrasesIntro: 'Almanca · tələffüz · tərcümə. Tələffüz yalnız köməkçidir.',
    waste: {
      title: 'Zibilin çeşidlənməsi',
      items: [
        'Sarı konteyner / sarı torba: qablaşdırma — plastik, metal qutular, folqa.',
        'Mavi konteyner: kağız və karton (yağlı karton yox).',
        'Qəhvəyi (Bio): yemək qalıqları, meyvə qabığı, qəhvə çöküntüsü.',
        'Boz/qara (Restmüll): qalan hər şey — uşaq bezi, kül, tozsoran torbası.',
        'Şüşə: rənginə görə ağ / yaşıl / qəhvəyi konteynerə; axşam və bazar günü atmayın.',
        'Pfand: üzərində Pfand nişanı olan butulkaları mağazaya qaytarın — birdəfəlik ən azı 0,25 €.',
        'Batareya və elektronika: mağazadakı qutulara və ya Wertstoffhof-a.',
      ],
      note: 'Qaydalar şəhərdən şəhərə dəyişir — şəhərinizin zibil təqvimini (Abfallkalender) yoxlayın.',
    },
    tickets: {
      title: 'Nəqliyyat və Deutschlandticket',
      items: [
        `Deutschlandticket: ayda ${f.ticket}${f.ticketNext ? ` (sonra ${f.ticketNext})` : ''} — bütün Almaniyada avtobus, tramvay, U-Bahn, S-Bahn və regional qatarlar (RE, RB).`,
        'Uzaq məsafə qatarları (ICE, IC, EC) daxil deyil — onlar üçün ayrıca bilet; erkən alanda ucuzdur.',
        'Bu, aylıq abunədir: adətən ayın 10-na qədər ləğv etsəniz, həmin ayın sonunda bitir.',
        'İşəgötürən çox vaxt Jobticket ilə endirim verir — soruşun.',
        'Biletsiz gediş cərimə (adətən 60 €) və cinayət işi ola bilər. Bəzi şəhərlərdə kağız bileti avtomatda vurmaq (entwerten) lazımdır.',
        'Biletinizi və şəxsiyyət sənədinizi yoxlamada göstərməyə hazır olun.',
      ],
    },
    work: {
      title: 'İşdə hüquqlarınız',
      items: [
        `Minimum əmək haqqı: saatda ${f.minWage} brutto (${f.minWageFrom} tarixindən)${f.minWageNext ? `; sonra ${f.minWageNext}` : ''}.`,
        'İş vaxtı: gündə 8 saat, ortalama ilə 10 saata qədər; növbələr arasında ən azı 11 saat istirahət.',
        'Fasilə: 6 saatdan çox işdə 30 dəq., 9 saatdan çox işdə 45 dəq.',
        'Məzuniyyət: 5 günlük iş həftəsində ildə ən azı 20 iş günü.',
        'Xəstələnsəniz: işə başlamazdan əvvəl işəgötürənə xəbər verin. 3 gündən çox xəstəlikdə həkim arayışı (AU) lazımdır; işəgötürən daha tez də istəyə bilər.',
        'Xəstəlik zamanı maaş 6 həftəyə qədər ödənilir. Dövlət sığortasında həkim arayışı elektron göndərilir (eAU).',
        'Hər ay maaş vərəqəsi (Lohnabrechnung) almalısınız. Pasportunuzu heç kimə saxlamağa verməyin.',
      ],
    },
    doctor: {
      title: 'Həkim və aptek',
      items: [
        'Əvvəlcə ailə həkimi (Hausarzt) seçin; sığorta kartını (eGK) həmişə özünüzlə götürün.',
        'Həkim termini: telefonla, onlayn və ya 116 117 xidməti ilə.',
        'Resept: aptekdə dərman üçün adətən 10 % ödəyirsiniz — ən azı 5 €, ən çox 10 €.',
        'Növbətçi aptek: hər aptekin qapısında göstərilir.',
        'Ağır hallarda — 112 və ya xəstəxananın Notaufnahme şöbəsi.',
        'Diş həkimində ildə bir dəfə müayinə adətən sığorta ilə ödənilir.',
      ],
    },
    rent: {
      title: 'Kirayə: əsas qaydalar',
      items: [
        'Kaltmiete — xalis kirayə; Warmmiete — kommunal xərclərlə (Nebenkosten: istilik, su, zibil və s.).',
        'Depozit (Kaution): ən çox 3 aylıq xalis kirayə; 3 hissəyə bölüb ödəmək olar.',
        'Kommunal xərclərin illik hesabı (Nebenkostenabrechnung) dövr bitdikdən sonra 12 ay ərzində gəlməlidir — yoxlayın.',
        'Anmeldung üçün ev sahibinin təsdiqi (Wohnungsgeberbestätigung) lazımdır.',
        'Köçəndə təhvil-təslim protokolu (Übergabeprotokoll) yazın, şəkil çəkin.',
        'Sükut saatları adətən 22:00–06:00. Mənzili görmədən və müqavilə olmadan pul göndərməyin — fırıldaq ola bilər.',
      ],
    },
    money: {
      title: 'Ailəyə pul göndərmək',
      items: [
        'Yekun xərci müqayisə edin: komissiya + məzənnə fərqi (rəsmi AMB məzənnəsi ilə).',
        'Az sayda böyük köçürmə çox sayda kiçikdən adətən ucuzdur (sabit komissiyalar).',
        'Alıcının adını pasportda/IBAN-da olduğu kimi yazın; qəbzləri saxlayın.',
        'Rəsmi olmayan "əldən-ələ" pul daşıyıcılarından istifadə etməyin — riskli və qanunsuz ola bilər.',
        'İnternetdə tanış olduğunuz və ya "iş agenti" deyib pul istəyənlərə pul göndərməyin.',
        'Əvvəlcə kirayə, yemək və ehtiyat pulunu ayırın, sonra göndərin.',
      ],
    },
    links: { title: 'Faydalı alətlər (QR)', intro: 'Telefonun kamerası ilə skan edin:', website: 'Sayt', phone: 'Telefon / WhatsApp' },
    notesTitle: 'Qeydlər',
    contactsTitle: 'Vacib ünvanlar',
    contactFields: ['Ailə həkimi', 'Krankenkasse', 'Ausländerbehörde', 'Bürgeramt', 'Ev sahibi / Hausverwaltung', 'İşdə əlaqə şəxsi', 'Bank'],
    back: {
      title: 'Mənbələr',
      disclaimer: 'Bu bələdçi ümumi məlumatdır, hüquqi məsləhət deyil. Qaydalar və məbləğlər dəyişə bilər — vacib addımlardan əvvəl rəsmi mənbəni yoxlayın.',
      sources: 'Qanunlar: gesetze-im-internet.de (BMG, ArbZG, BUrlG, EntgFG, BGB, SGB V, VerpackG) · Minimum əmək haqqı və Deutschlandticket: federal qərarlar · 116 116: sperr-notruf.de · Səfirlik: auswaertiges-amt.de, berlin.mfa.gov.az · Məzənnə: cbar.az',
      estimate: 'Cərimə və aptek məbləğləri orientasiya üçündür.',
    },
  },
  ru: {
    language: 'Русский',
    title: 'Карманный гид по Германии',
    subtitle: 'Главные номера, шаги и фразы на первые недели',
    preparedFor: 'Для',
    edition: (d) => `По состоянию на ${d}`,
    page: 'стр.',
    emergency: {
      title: 'Экстренные номера',
      rows: [
        { number: '112', label: 'Пожарные и скорая помощь', note: 'Угроза жизни, пожар, тяжёлая авария. Бесплатно.' },
        { number: '110', label: 'Полиция', note: 'Кража, нападение, ДТП. Бесплатно.' },
        { number: '116 117', label: 'Дежурный врач', note: 'Неэкстренные случаи — ночью, в выходные и праздники; помогает и с записью к врачу.' },
        { number: '116 116', label: 'Блокировка банковской карты', note: 'Sperr-Notruf, круглосуточно. Из-за границы: +49 116 116. С этого номера вам никогда не звонят!' },
      ],
      embassy: 'Посольство Азербайджана в Берлине',
      consular: 'Консульский отдел',
      support: 'Поддержка Triad Vision',
      myEmployer: 'Мой работодатель',
      sayHelp: 'Скажите: «Ich brauche Hilfe. Meine Adresse ist …» — Мне нужна помощь. Мой адрес …',
    },
    firstDays: {
      title: 'Первые 14 дней: чек-лист',
      check: true,
      items: [
        'Anmeldung: регистрация в Bürgeramt в течение 2 недель после въезда в жильё. Возьмите паспорт и подтверждение арендодателя (Wohnungsgeberbestätigung).',
        'Сохраните Meldebescheinigung (справку о регистрации) — её попросят банк, работодатель и Ausländerbehörde.',
        'Медстраховка (Krankenkasse): выберите государственную кассу до первого рабочего дня, справку о членстве отдайте работодателю.',
        'Банковский счёт (Girokonto): нужен для зарплаты; сообщите IBAN работодателю.',
        'Steuer-ID: придёт по почте через несколько недель после регистрации — передайте работодателю. Не пришёл — запросите в BZSt.',
        'Номер соцстрахования: обычно через Krankenkasse/работодателя, письмо от Deutsche Rentenversicherung.',
        'Проверьте срок визы и заранее запишитесь в Ausländerbehörde на вид на жительство.',
        `Rundfunkbeitrag: ${f.rundfunk} в месяц за квартиру — зарегистрируйтесь, если в квартире никто не платит.`,
        'SIM-карта (с проверкой документа); рекомендуется страховка ответственности (Haftpflicht).',
      ],
    },
    buergeramt: 'Ваш Bürgeramt',
    phrasesTitle: (p) => `40 важных фраз (${p}/3)`,
    phrasesIntro: 'Немецкий · произношение · перевод. Произношение — только подсказка.',
    waste: {
      title: 'Сортировка мусора',
      items: [
        'Жёлтый бак / жёлтый мешок: упаковка — пластик, металлические банки, фольга.',
        'Синий бак: бумага и картон (без жирного картона).',
        'Коричневый (Bio): остатки еды, очистки, кофейная гуща.',
        'Серый/чёрный (Restmüll): всё остальное — подгузники, пепел, мешки пылесоса.',
        'Стекло: в контейнеры по цвету — белое / зелёное / коричневое; не вечером и не в воскресенье.',
        'Pfand: бутылки со знаком Pfand сдавайте в магазин — одноразовые минимум 0,25 €.',
        'Батарейки и электроника: в ящики в магазинах или на Wertstoffhof.',
      ],
      note: 'Правила отличаются по городам — смотрите календарь вывоза мусора (Abfallkalender) своего города.',
    },
    tickets: {
      title: 'Транспорт и Deutschlandticket',
      items: [
        `Deutschlandticket: ${f.ticket} в месяц${f.ticketNext ? ` (затем ${f.ticketNext})` : ''} — по всей Германии автобусы, трамваи, U-Bahn, S-Bahn и региональные поезда (RE, RB).`,
        'Поезда дальнего следования (ICE, IC, EC) не входят — нужен отдельный билет; заранее дешевле.',
        'Это месячная подписка: обычно при отмене до 10-го числа она заканчивается в конце этого месяца.',
        'Работодатель часто даёт скидку через Jobticket — спросите.',
        'Проезд без билета — штраф (обычно 60 €) и возможное уголовное дело. В некоторых городах бумажный билет нужно прокомпостировать (entwerten).',
        'Будьте готовы показать билет и документ при проверке.',
      ],
    },
    work: {
      title: 'Ваши права на работе',
      items: [
        `Минимальная зарплата: ${f.minWage} брутто в час (с ${f.minWageFrom})${f.minWageNext ? `; затем ${f.minWageNext}` : ''}.`,
        'Рабочее время: 8 часов в день, в среднем до 10 часов; между сменами минимум 11 часов отдыха.',
        'Перерыв: 30 мин. при работе более 6 часов, 45 мин. — более 9 часов.',
        'Отпуск: минимум 20 рабочих дней в год при 5-дневной неделе.',
        'Заболели: сообщите работодателю до начала смены. При болезни дольше 3 дней нужна справка (AU); работодатель может потребовать её раньше.',
        'Зарплата при болезни сохраняется до 6 недель. При госстраховке врач передаёт справку электронно (eAU).',
        'Каждый месяц вы получаете расчётный лист (Lohnabrechnung). Никому не отдавайте паспорт на хранение.',
      ],
    },
    doctor: {
      title: 'Врач и аптека',
      items: [
        'Сначала выберите семейного врача (Hausarzt); карту страховки (eGK) всегда носите с собой.',
        'Запись к врачу: по телефону, онлайн или через сервис 116 117.',
        'Рецепт: в аптеке обычно доплата 10 % — минимум 5 €, максимум 10 €.',
        'Дежурная аптека: указана на двери каждой аптеки.',
        'В тяжёлых случаях — 112 или приёмное отделение больницы (Notaufnahme).',
        'Профилактический осмотр у стоматолога раз в год обычно оплачивает страховка.',
      ],
    },
    rent: {
      title: 'Аренда: основное',
      items: [
        'Kaltmiete — чистая аренда; Warmmiete — с коммунальными (Nebenkosten: отопление, вода, мусор и т. д.).',
        'Залог (Kaution): максимум 3 месячные чистые аренды; можно платить тремя частями.',
        'Годовой расчёт коммунальных (Nebenkostenabrechnung) должен прийти в течение 12 месяцев после периода — проверяйте.',
        'Для Anmeldung нужно подтверждение арендодателя (Wohnungsgeberbestätigung).',
        'При въезде составьте акт передачи (Übergabeprotokoll) и сделайте фото.',
        'Часы тишины обычно 22:00–06:00. Не переводите деньги, не увидев квартиру и без договора — это может быть мошенничество.',
      ],
    },
    money: {
      title: 'Деньги семье',
      items: [
        'Сравнивайте итоговую стоимость: комиссия + разница курса (с официальным курсом ЦБА).',
        'Несколько крупных переводов обычно дешевле множества мелких (фиксированные комиссии).',
        'Пишите имя получателя как в паспорте/IBAN; храните квитанции.',
        'Не пользуйтесь неофициальными курьерами наличных — рискованно и может быть незаконно.',
        'Не отправляйте деньги знакомым из интернета и «агентам по трудоустройству», требующим оплату.',
        'Сначала отложите на аренду, еду и резерв, потом отправляйте.',
      ],
    },
    links: { title: 'Полезные инструменты (QR)', intro: 'Отсканируйте камерой телефона:', website: 'Сайт', phone: 'Телефон / WhatsApp' },
    notesTitle: 'Заметки',
    contactsTitle: 'Важные адреса',
    contactFields: ['Семейный врач', 'Krankenkasse', 'Ausländerbehörde', 'Bürgeramt', 'Арендодатель / Hausverwaltung', 'Контакт на работе', 'Банк'],
    back: {
      title: 'Источники',
      disclaimer: 'Гид носит общий информационный характер и не является юридической консультацией. Правила и суммы могут меняться — перед важными шагами проверяйте официальный источник.',
      sources: 'Законы: gesetze-im-internet.de (BMG, ArbZG, BUrlG, EntgFG, BGB, SGB V, VerpackG) · МРОТ и Deutschlandticket: федеральные решения · 116 116: sperr-notruf.de · Посольство: auswaertiges-amt.de, berlin.mfa.gov.az · Курс: cbar.az',
      estimate: 'Суммы штрафов и доплат в аптеке — ориентировочные.',
    },
  },
  en: {
    language: 'English',
    title: 'Germany pocket guide',
    subtitle: 'The key numbers, steps and phrases for your first weeks',
    preparedFor: 'Prepared for',
    edition: (d) => `As of ${d}`,
    page: 'p.',
    emergency: {
      title: 'Emergency numbers',
      rows: [
        { number: '112', label: 'Fire brigade and ambulance', note: 'Danger to life, fire, serious accident. Free of charge.' },
        { number: '110', label: 'Police', note: 'Theft, assault, traffic accident. Free of charge.' },
        { number: '116 117', label: 'Doctor on call', note: 'Non-life-threatening illness at night, weekends, holidays; also helps to find a doctor appointment.' },
        { number: '116 116', label: 'Block bank cards', note: 'Sperr-Notruf, 24/7. From abroad: +49 116 116. This number never calls you!' },
      ],
      embassy: 'Embassy of Azerbaijan in Berlin',
      consular: 'Consular section',
      support: 'Triad Vision support',
      myEmployer: 'My employer',
      sayHelp: 'Say: "Ich brauche Hilfe. Meine Adresse ist …" — I need help. My address is …',
    },
    firstDays: {
      title: 'First 14 days: checklist',
      check: true,
      items: [
        'Anmeldung: register at the Bürgeramt within 2 weeks of moving in. Bring your passport and the landlord\'s confirmation (Wohnungsgeberbestätigung).',
        'Keep the Meldebescheinigung (registration certificate) — the bank, employer and Ausländerbehörde will ask for it.',
        'Health insurance (Krankenkasse): choose a statutory fund before your first work day and give the membership certificate to your employer.',
        'Bank account (Girokonto): needed for your salary; give the IBAN to your employer.',
        'Steuer-ID (tax ID): arrives by post a few weeks after registering — give it to your employer. Not arrived? Ask the BZSt.',
        'Social insurance number: usually via the Krankenkasse/employer; Deutsche Rentenversicherung sends it by post.',
        'Check your visa expiry date and book the Ausländerbehörde appointment for your residence permit early.',
        `Rundfunkbeitrag (broadcasting fee): ${f.rundfunk} a month per flat — register unless a flatmate already pays.`,
        'SIM card (ID check required); personal liability insurance (Haftpflicht) is recommended.',
      ],
    },
    buergeramt: 'Your Bürgeramt',
    phrasesTitle: (p) => `40 essential phrases (${p}/3)`,
    phrasesIntro: 'German · pronunciation · meaning. Pronunciation is only a reading aid.',
    waste: {
      title: 'Waste sorting',
      items: [
        'Yellow bin / yellow bag: packaging — plastic, metal cans, foil.',
        'Blue bin: paper and cardboard (no greasy cardboard).',
        'Brown bin (Bio): food scraps, peels, coffee grounds.',
        'Grey/black bin (Restmüll): everything else — nappies, ashes, vacuum bags.',
        'Glass: bottle banks by colour — white / green / brown; not in the evening or on Sundays.',
        'Pfand: return bottles with the deposit logo to the shop — at least 0.25 € for one-way bottles.',
        'Batteries and electronics: collection boxes in shops or the Wertstoffhof.',
      ],
      note: 'Rules differ between cities — check your city\'s waste calendar (Abfallkalender).',
    },
    tickets: {
      title: 'Transport and Deutschlandticket',
      items: [
        `Deutschlandticket: ${f.ticket} a month${f.ticketNext ? ` (then ${f.ticketNext})` : ''} — buses, trams, U-Bahn, S-Bahn and regional trains (RE, RB) all over Germany.`,
        'Long-distance trains (ICE, IC, EC) are not included — buy a separate ticket; early booking is cheaper.',
        'It is a monthly subscription: usually, cancel by the 10th to end it at the end of that month.',
        'Employers often subsidise it as a Jobticket — ask.',
        'Riding without a ticket means a penalty fare (usually 60 €) and possibly criminal charges. In some cities paper tickets must be validated (entwerten).',
        'Be ready to show your ticket and ID during checks.',
      ],
    },
    work: {
      title: 'Your rights at work',
      items: [
        `Minimum wage: ${f.minWage} gross per hour (since ${f.minWageFrom})${f.minWageNext ? `; then ${f.minWageNext}` : ''}.`,
        'Working time: 8 hours a day, up to 10 on average; at least 11 hours rest between shifts.',
        'Breaks: 30 min when working more than 6 hours, 45 min when more than 9 hours.',
        'Holidays: at least 20 working days a year on a 5-day week.',
        'Sick: tell your employer before your shift starts. Illness longer than 3 days needs a doctor\'s note (AU); the employer may ask for it earlier.',
        'Pay continues for up to 6 weeks of illness. With statutory insurance the doctor sends the note electronically (eAU).',
        'You get a payslip (Lohnabrechnung) every month. Never hand your passport to anyone for safekeeping.',
      ],
    },
    doctor: {
      title: 'Doctor and pharmacy',
      items: [
        'Choose a family doctor (Hausarzt) first; always carry your health insurance card (eGK).',
        'Appointments: by phone, online or via the 116 117 service.',
        'Prescriptions: at the pharmacy you usually pay 10 % — at least 5 €, at most 10 €.',
        'Pharmacy on duty: shown on the door of every pharmacy.',
        'Serious cases: 112 or the hospital emergency department (Notaufnahme).',
        'A yearly dental check-up is usually covered by insurance.',
      ],
    },
    rent: {
      title: 'Renting: the basics',
      items: [
        'Kaltmiete is the net rent; Warmmiete includes service charges (Nebenkosten: heating, water, waste …).',
        'Deposit (Kaution): at most 3 months\' net rent; you may pay it in 3 instalments.',
        'The yearly service-charge statement (Nebenkostenabrechnung) must arrive within 12 months after the period — check it.',
        'You need the landlord\'s confirmation (Wohnungsgeberbestätigung) for the Anmeldung.',
        'At move-in, fill in a handover report (Übergabeprotokoll) and take photos.',
        'Quiet hours are usually 10 pm – 6 am. Never pay before seeing the flat and signing a contract — it may be a scam.',
      ],
    },
    money: {
      title: 'Sending money home',
      items: [
        'Compare the total cost: fee + exchange-rate margin (against the official CBAR rate).',
        'A few larger transfers are usually cheaper than many small ones (fixed fees).',
        'Write the recipient\'s name exactly as in the passport/IBAN; keep the receipts.',
        'Avoid informal cash couriers — risky and possibly illegal.',
        'Never send money to people you met online or to "job agents" asking for fees.',
        'Put aside rent, food and an emergency reserve first, then send.',
      ],
    },
    links: { title: 'Useful tools (QR)', intro: 'Scan with your phone camera:', website: 'Website', phone: 'Phone / WhatsApp' },
    notesTitle: 'Notes',
    contactsTitle: 'Important contacts',
    contactFields: ['Family doctor', 'Krankenkasse', 'Ausländerbehörde', 'Bürgeramt', 'Landlord / Hausverwaltung', 'Contact at work', 'Bank'],
    back: {
      title: 'Sources',
      disclaimer: 'This guide is general information, not legal advice. Rules and amounts may change — check the official source before important steps.',
      sources: 'Laws: gesetze-im-internet.de (BMG, ArbZG, BUrlG, EntgFG, BGB, SGB V, VerpackG) · Minimum wage and Deutschlandticket: federal decisions · 116 116: sperr-notruf.de · Embassy: auswaertiges-amt.de, berlin.mfa.gov.az · Rate: cbar.az',
      estimate: 'Penalty and pharmacy amounts are for orientation.',
    },
  },
  de: {
    language: 'Deutsch',
    title: 'Deutschland-Taschenguide',
    subtitle: 'Die wichtigsten Nummern, Schritte und Sätze für die ersten Wochen',
    preparedFor: 'Für',
    edition: (d) => `Stand: ${d}`,
    page: 'S.',
    emergency: {
      title: 'Notrufnummern',
      rows: [
        { number: '112', label: 'Feuerwehr und Rettungsdienst', note: 'Lebensgefahr, Brand, schwerer Unfall. Kostenlos.' },
        { number: '110', label: 'Polizei', note: 'Diebstahl, Angriff, Verkehrsunfall. Kostenlos.' },
        { number: '116 117', label: 'Ärztlicher Bereitschaftsdienst', note: 'Nicht lebensbedrohlich — nachts, am Wochenende, an Feiertagen; hilft auch bei der Terminsuche.' },
        { number: '116 116', label: 'Karten sperren', note: 'Sperr-Notruf, rund um die Uhr. Aus dem Ausland: +49 116 116. Diese Nummer ruft Sie nie an!' },
      ],
      embassy: 'Botschaft Aserbaidschans in Berlin',
      consular: 'Konsularabteilung',
      support: 'Triad Vision Support',
      myEmployer: 'Mein Arbeitgeber',
      sayHelp: 'Sagen Sie: „Ich brauche Hilfe. Meine Adresse ist …“',
    },
    firstDays: {
      title: 'Die ersten 14 Tage: Checkliste',
      check: true,
      items: [
        'Anmeldung beim Bürgeramt innerhalb von 2 Wochen nach dem Einzug. Mitbringen: Pass und Wohnungsgeberbestätigung.',
        'Meldebescheinigung aufbewahren — Bank, Arbeitgeber und Ausländerbehörde fragen danach.',
        'Krankenkasse vor dem ersten Arbeitstag wählen, Mitgliedsbescheinigung dem Arbeitgeber geben.',
        'Girokonto eröffnen (für das Gehalt); IBAN dem Arbeitgeber mitteilen.',
        'Steuer-ID kommt einige Wochen nach der Anmeldung per Post — an den Arbeitgeber geben. Nicht gekommen? Beim BZSt anfragen.',
        'Sozialversicherungsnummer: meist über Krankenkasse/Arbeitgeber, Brief der Deutschen Rentenversicherung.',
        'Ablaufdatum des Visums prüfen und früh einen Termin bei der Ausländerbehörde für den Aufenthaltstitel buchen.',
        `Rundfunkbeitrag: ${f.rundfunk} im Monat pro Wohnung — anmelden, wenn in der Wohnung noch niemand zahlt.`,
        'SIM-Karte (mit Ausweisprüfung); private Haftpflichtversicherung empfohlen.',
      ],
    },
    buergeramt: 'Ihr Bürgeramt',
    phrasesTitle: (p) => `40 wichtige Sätze (${p}/3)`,
    phrasesIntro: 'Deutsch · Bedeutung auf Aserbaidschanisch und Russisch (für Gespräche mit Kolleginnen und Kollegen).',
    waste: {
      title: 'Mülltrennung',
      items: [
        'Gelbe Tonne / Gelber Sack: Verpackungen — Plastik, Dosen, Folien.',
        'Blaue Tonne: Papier und Pappe (keine fettige Pappe).',
        'Biotonne (braun): Essensreste, Schalen, Kaffeesatz.',
        'Restmüll (grau/schwarz): alles andere — Windeln, Asche, Staubsaugerbeutel.',
        'Glas: Container nach Farbe — weiß / grün / braun; nicht abends und sonntags einwerfen.',
        'Pfand: Flaschen mit Pfandzeichen im Laden zurückgeben — Einweg mindestens 0,25 €.',
        'Batterien und Elektrogeräte: Sammelboxen im Handel oder Wertstoffhof.',
      ],
      note: 'Die Regeln unterscheiden sich je nach Stadt — Abfallkalender Ihrer Stadt prüfen.',
    },
    tickets: {
      title: 'Nahverkehr und Deutschlandticket',
      items: [
        `Deutschlandticket: ${f.ticket} im Monat${f.ticketNext ? ` (danach ${f.ticketNext})` : ''} — bundesweit Bus, Tram, U-Bahn, S-Bahn und Regionalzüge (RE, RB).`,
        'Fernzüge (ICE, IC, EC) sind nicht enthalten — eigenes Ticket; früh gebucht ist es günstiger.',
        'Es ist ein Monatsabo: Kündigung meist bis zum 10. zum Monatsende.',
        'Arbeitgeber bezuschussen es oft als Jobticket — fragen Sie nach.',
        'Fahren ohne Ticket kostet ein erhöhtes Beförderungsentgelt (meist 60 €) und kann strafbar sein. Papiertickets teils entwerten.',
        'Ticket und Ausweis bei Kontrollen bereithalten.',
      ],
    },
    work: {
      title: 'Ihre Rechte bei der Arbeit',
      items: [
        `Mindestlohn: ${f.minWage} brutto pro Stunde (seit ${f.minWageFrom})${f.minWageNext ? `; danach ${f.minWageNext}` : ''}.`,
        'Arbeitszeit: 8 Stunden am Tag, im Durchschnitt bis 10; mindestens 11 Stunden Ruhe zwischen Schichten.',
        'Pausen: 30 Min. bei mehr als 6 Stunden, 45 Min. bei mehr als 9 Stunden.',
        'Urlaub: mindestens 20 Arbeitstage im Jahr bei einer 5-Tage-Woche.',
        'Krank: vor Schichtbeginn dem Arbeitgeber Bescheid sagen. Ab mehr als 3 Tagen Krankheit ist eine AU nötig; der Arbeitgeber kann sie früher verlangen.',
        'Lohnfortzahlung bis zu 6 Wochen. Bei gesetzlich Versicherten übermittelt die Praxis die AU elektronisch (eAU).',
        'Jeden Monat gibt es eine Lohnabrechnung. Den Pass nie jemandem zur Aufbewahrung geben.',
      ],
    },
    doctor: {
      title: 'Arzt und Apotheke',
      items: [
        'Zuerst eine Hausarztpraxis wählen; Gesundheitskarte (eGK) immer dabeihaben.',
        'Termine: per Telefon, online oder über den Service 116 117.',
        'Rezept: in der Apotheke meist 10 % Zuzahlung — mindestens 5 €, höchstens 10 €.',
        'Notdienst-Apotheke: steht an der Tür jeder Apotheke.',
        'Schwere Fälle: 112 oder die Notaufnahme im Krankenhaus.',
        'Die jährliche Kontrolle beim Zahnarzt zahlt in der Regel die Kasse.',
      ],
    },
    rent: {
      title: 'Mieten: das Wichtigste',
      items: [
        'Kaltmiete = Nettomiete; Warmmiete = mit Nebenkosten (Heizung, Wasser, Müll …).',
        'Kaution: höchstens 3 Nettokaltmieten, zahlbar in 3 Raten.',
        'Die Nebenkostenabrechnung muss innerhalb von 12 Monaten nach dem Abrechnungszeitraum kommen — prüfen.',
        'Für die Anmeldung braucht man die Wohnungsgeberbestätigung.',
        'Beim Einzug Übergabeprotokoll ausfüllen und Fotos machen.',
        'Ruhezeiten meist 22–6 Uhr. Nie Geld zahlen, ohne die Wohnung gesehen und einen Vertrag zu haben — Betrugsgefahr.',
      ],
    },
    money: {
      title: 'Geld nach Hause schicken',
      items: [
        'Gesamtkosten vergleichen: Gebühr + Kursaufschlag (gegenüber dem offiziellen CBAR-Kurs).',
        'Wenige größere Überweisungen sind meist günstiger als viele kleine (Fixgebühren).',
        'Empfängernamen genau wie im Pass/IBAN schreiben; Belege aufbewahren.',
        'Keine informellen Bargeld-Kuriere nutzen — riskant und womöglich illegal.',
        'Kein Geld an Online-Bekanntschaften oder „Jobvermittler“ schicken, die Gebühren verlangen.',
        'Zuerst Miete, Essen und Rücklage einplanen, dann senden.',
      ],
    },
    links: { title: 'Nützliche Tools (QR)', intro: 'Mit der Handykamera scannen:', website: 'Website', phone: 'Telefon / WhatsApp' },
    notesTitle: 'Notizen',
    contactsTitle: 'Wichtige Kontakte',
    contactFields: ['Hausarzt', 'Krankenkasse', 'Ausländerbehörde', 'Bürgeramt', 'Vermieter / Hausverwaltung', 'Ansprechpartner Arbeit', 'Bank'],
    back: {
      title: 'Quellen',
      disclaimer: 'Dieser Guide dient der allgemeinen Information und ist keine Rechtsberatung. Regeln und Beträge können sich ändern — vor wichtigen Schritten die offizielle Quelle prüfen.',
      sources: 'Gesetze: gesetze-im-internet.de (BMG, ArbZG, BUrlG, EntgFG, BGB, SGB V, VerpackG) · Mindestlohn und Deutschlandticket: Bundesbeschlüsse · 116 116: sperr-notruf.de · Botschaft: auswaertiges-amt.de, berlin.mfa.gov.az · Kurs: cbar.az',
      estimate: 'Beträge zu Bußgeld und Zuzahlung zur Orientierung.',
    },
  },
});

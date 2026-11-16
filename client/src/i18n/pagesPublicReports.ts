/** Public page /reports: published quarterly labour mobility reports. Keys under reportsPage.*. */
const az = {
  reportsPage: {
    title: 'Rüblük hesabatlar',
    subtitle: 'Azərbaycan → Almaniya əmək miqrasiyası: Triad Vision ilə hazırlanmış müraciətlər üzrə anonim rüblük statistika (PDF).',
    listTitle: 'Dərc olunmuş hesabatlar',
    approved: 'Təsdiqlənmiş vizalar: {{n}}',
    fewer: 'Təsdiqlənmiş vizalar: 3-dən az',
    published: 'Dərc tarixi: {{date}}',
    download: 'PDF',
    langs: { az: 'Azərbaycanca', en: 'English', de: 'Deutsch' },
    emptyTitle: 'Hələ dərc olunmuş hesabat yoxdur',
    emptyBody: 'İlk rüblük hesabat kifayət qədər məlumat toplandıqdan sonra burada dərc ediləcək.',
    methodTitle: 'Rəqəmlər necə hesablanır?',
    method: [
      'Mənbə: Triad Vision-un daxili müraciət sistemi — rüb ərzində səfirliyin təsdiq etdiyi əsas müraciətlər (Bakı vaxtı ilə).',
      'Bölgülər: peşə, viza növü, Almaniya əyaləti (işəgötürənin şəhəri), alman dili səviyyəsi; mərhələlər üzrə orta və median müddət; əvvəlki rüblə müqayisə.',
      'Məxfilik (k-anonimlik, k = 3): 3-dən az müraciəti olan qruplar "Digər"də birləşdirilir və ya göstərilmir. Fərdi məlumat heç vaxt dərc edilmir.',
      'Biz sənədləri hazırlayırıq; müştəri səfirliyə özü müraciət edir, qərarı səfirlik verir. Bu rəqəmlər rəsmi statistika deyil.',
    ],
    contact: 'Sualınız var? Zəng edin: {{phone}}',
  },
};

type Copy = typeof az;

const de: Copy = {
  reportsPage: {
    title: 'Quartalsberichte',
    subtitle: 'Arbeitsmobilität Aserbaidschan → Deutschland: anonyme Quartalsstatistik der mit Triad Vision vorbereiteten Anträge (PDF).',
    listTitle: 'Veröffentlichte Berichte',
    approved: 'Erteilte Visa: {{n}}',
    fewer: 'Erteilte Visa: weniger als 3',
    published: 'Veröffentlicht am {{date}}',
    download: 'PDF',
    langs: { az: 'Azərbaycanca', en: 'English', de: 'Deutsch' },
    emptyTitle: 'Noch kein Bericht veröffentlicht',
    emptyBody: 'Der erste Quartalsbericht erscheint hier, sobald genug Daten vorliegen.',
    methodTitle: 'Wie werden die Zahlen berechnet?',
    method: [
      'Quelle: internes Fallsystem von Triad Vision — Hauptanträge, die die Botschaft im Quartal bewilligt hat (Bakuer Zeit).',
      'Aufschlüsselung: Beruf, Visumart, Bundesland (Stadt des Arbeitgebers), Deutschniveau; Mittelwert und Median der Dauer je Phase; Vergleich mit dem Vorquartal.',
      'Datenschutz (k-Anonymität, k = 3): Gruppen mit weniger als 3 Anträgen werden unter „Sonstige“ zusammengefasst oder nicht ausgewiesen. Einzeldaten werden nie veröffentlicht.',
      'Wir bereiten die Unterlagen vor; den Antrag stellt der Kunde selbst bei der Botschaft, die Botschaft entscheidet. Keine amtliche Statistik.',
    ],
    contact: 'Fragen? Rufen Sie uns an: {{phone}}',
  },
};

const en: Copy = {
  reportsPage: {
    title: 'Quarterly reports',
    subtitle: 'Azerbaijan → Germany labour mobility: anonymous quarterly statistics of applications prepared with Triad Vision (PDF).',
    listTitle: 'Published reports',
    approved: 'Visas approved: {{n}}',
    fewer: 'Visas approved: fewer than 3',
    published: 'Published on {{date}}',
    download: 'PDF',
    langs: { az: 'Azərbaycanca', en: 'English', de: 'Deutsch' },
    emptyTitle: 'No report published yet',
    emptyBody: 'The first quarterly report will appear here once there is enough data.',
    methodTitle: 'How are the figures calculated?',
    method: [
      'Source: Triad Vision’s internal case system — main applications the embassy approved in the quarter (Baku time).',
      'Breakdowns: profession, visa type, German federal state (employer’s city), German level; mean and median time per stage; comparison with the previous quarter.',
      'Privacy (k-anonymity, k = 3): groups with fewer than 3 applications are merged into "Other" or not shown. Individual data is never published.',
      'We prepare the documents; the client applies to the embassy, and the embassy decides. These are not official statistics.',
    ],
    contact: 'Questions? Call us: {{phone}}',
  },
};

const ru: Copy = {
  reportsPage: {
    title: 'Квартальные отчёты',
    subtitle: 'Трудовая мобильность Азербайджан → Германия: анонимная квартальная статистика заявлений, подготовленных с Triad Vision (PDF).',
    listTitle: 'Опубликованные отчёты',
    approved: 'Одобрено виз: {{n}}',
    fewer: 'Одобрено виз: меньше 3',
    published: 'Опубликован {{date}}',
    download: 'PDF',
    langs: { az: 'Azərbaycanca', en: 'English', de: 'Deutsch' },
    emptyTitle: 'Отчётов пока нет',
    emptyBody: 'Первый квартальный отчёт появится здесь, когда накопится достаточно данных.',
    methodTitle: 'Как считаются цифры?',
    method: [
      'Источник: внутренняя система дел Triad Vision — основные заявления, одобренные посольством за квартал (по бакинскому времени).',
      'Разбивка: профессия, тип визы, федеральная земля (город работодателя), уровень немецкого; средняя и медианная длительность этапов; сравнение с прошлым кварталом.',
      'Конфиденциальность (k-анонимность, k = 3): группы меньше 3 заявлений объединяются в «Другое» или не показываются. Персональные данные не публикуются.',
      'Мы готовим документы; клиент сам подаёт заявление в посольство, решение принимает посольство. Это не официальная статистика.',
    ],
    contact: 'Есть вопросы? Звоните: {{phone}}',
  },
};

const tr: Copy = {
  reportsPage: {
    title: 'Üç aylık raporlar',
    subtitle: 'Azerbaycan → Almanya işgücü hareketliliği: Triad Vision ile hazırlanan başvuruların anonim üç aylık istatistiği (PDF).',
    listTitle: 'Yayımlanan raporlar',
    approved: 'Onaylanan vizeler: {{n}}',
    fewer: 'Onaylanan vizeler: 3’ten az',
    published: 'Yayın tarihi: {{date}}',
    download: 'PDF',
    langs: { az: 'Azərbaycanca', en: 'English', de: 'Deutsch' },
    emptyTitle: 'Henüz yayımlanmış rapor yok',
    emptyBody: 'İlk üç aylık rapor, yeterli veri toplandığında burada yayımlanacak.',
    methodTitle: 'Rakamlar nasıl hesaplanır?',
    method: [
      'Kaynak: Triad Vision’ın iç dosya sistemi — konsolosluğun çeyrek içinde onayladığı ana başvurular (Bakü saati).',
      'Dağılımlar: meslek, vize türü, Alman eyaleti (işverenin şehri), Almanca seviyesi; aşama başına ortalama ve medyan süre; önceki çeyrekle karşılaştırma.',
      'Gizlilik (k-anonimlik, k = 3): 3’ten az başvurulu gruplar “Diğer” altında birleştirilir veya gösterilmez. Kişisel veriler asla yayımlanmaz.',
      'Belgeleri biz hazırlarız; başvuruyu müşteri konsolosluğa kendisi yapar, kararı konsolosluk verir. Resmî istatistik değildir.',
    ],
    contact: 'Sorunuz mu var? Arayın: {{phone}}',
  },
};

const uk: Copy = {
  reportsPage: {
    title: 'Квартальні звіти',
    subtitle: 'Трудова мобільність Азербайджан → Німеччина: анонімна квартальна статистика заяв, підготовлених із Triad Vision (PDF).',
    listTitle: 'Опубліковані звіти',
    approved: 'Схвалено віз: {{n}}',
    fewer: 'Схвалено віз: менше 3',
    published: 'Опубліковано {{date}}',
    download: 'PDF',
    langs: { az: 'Azərbaycanca', en: 'English', de: 'Deutsch' },
    emptyTitle: 'Звітів поки немає',
    emptyBody: 'Перший квартальний звіт з’явиться тут, коли буде достатньо даних.',
    methodTitle: 'Як рахуються цифри?',
    method: [
      'Джерело: внутрішня система справ Triad Vision — основні заяви, схвалені посольством за квартал (за бакинським часом).',
      'Розподіл: професія, тип візи, федеральна земля (місто роботодавця), рівень німецької; середня та медіанна тривалість етапів; порівняння з попереднім кварталом.',
      'Конфіденційність (k-анонімність, k = 3): групи з менш ніж 3 заявами об’єднуються в «Інше» або не показуються. Персональні дані ніколи не публікуються.',
      'Ми готуємо документи; клієнт сам подає заяву до посольства, рішення ухвалює посольство. Це не офіційна статистика.',
    ],
    contact: 'Є запитання? Телефонуйте: {{phone}}',
  },
};

export const pagesPublicReports = { az, de, en, ru, tr, uk };

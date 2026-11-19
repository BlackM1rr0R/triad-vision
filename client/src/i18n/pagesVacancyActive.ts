// Per-vacancy "Aktiv / Deaktiv": the public badge and notice (deactivated vacancies stay visible, applications
// closed), the home page vacancy section and the admin toggle. Registered with registerCopy(pagesVacancyActive).
// Server: lib/vacancyActive.ts.

const az = {
  vacActive: {
    badge: 'Deaktiv',
    badgeLong: 'Deaktiv — müraciət qəbul olunmur',
    closedTitle: 'Bu vakansiya deaktivdir',
    closedText: 'Bu vakansiyaya indi müraciət qəbul olunmur. Səhifə məlumat üçün saytda qalır.',
    notifyHint: 'Oxşar vakansiya açılanda xəbər almaq üçün aşağıdakı formu doldurun.',
    closedHeading: 'Deaktiv vakansiyalar — müraciət qəbul olunmur',
    closedOption: '{{title}} — deaktiv',
    home: {
      eyebrow: 'Vakansiyalar',
      title: 'Almaniyada aktual vakansiyalar',
      subtitle: 'Bizim real vakansiyalarımız: peşə, şəhər, maaş, alman dili səviyyəsi və boş yerlər.',
      all: 'Bütün vakansiyalar',
    },
    admin: {
      active: 'Aktiv',
      inactive: 'Deaktiv',
      activate: 'Aktivləşdir',
      deactivate: 'Deaktiv et',
      toggleHint: 'Klikləyin: vakansiyanı aktiv və ya deaktiv edin',
      confirmTitle: 'Vakansiya deaktiv edilsin?',
      confirmText: 'Vakansiya saytda «Deaktiv» kimi görünəcək. Yeni müraciət qəbul olunmayacaq. İstənilən vaxt yenidən aktivləşdirə bilərsiniz.',
      confirmBulkTitle: '{{count}} vakansiya deaktiv edilsin?',
      activated: 'Vakansiya aktivləşdirildi',
      deactivated: 'Vakansiya deaktiv edildi',
      bulkDone: '{{changed}} / {{total}} vakansiya dəyişdi',
      bulkSkipped: 'Dəyişməyənlər: {{list}}',
      selected: '{{count}} seçilib',
      selectAll: 'Hamısını seç',
      select: 'Seç',
      clear: 'Seçimi təmizlə',
      policyNote: 'Bu iki qayda bütün vakansiyalara aid siyasətdir. Ayrı-ayrı vakansiyanı aktiv və ya deaktiv etmək üçün siyahıdakı «Aktiv / Deaktiv» düyməsindən istifadə edin.',
      errors: {
        NOT_PUBLISHED: 'Qaralama və yoxlamada olan vakansiya əvvəl təsdiqlənməlidir',
        ALREADY_ACTIVE: 'Artıq aktivdir',
        ALREADY_INACTIVE: 'Artıq deaktivdir',
        CLOSING_DATE_PASSED: 'Son tarix keçib — əvvəl tarixi dəyişin',
        COMPANY_NOT_ACTIVE: 'İşəgötürən aktiv deyil',
        VACANCY_NOT_FOUND: 'Vakansiya tapılmadı',
      },
    },
  },
};

type Copy = typeof az;

const de: Copy = {
  vacActive: {
    badge: 'Deaktiviert',
    badgeLong: 'Deaktiviert — keine Bewerbungen',
    closedTitle: 'Diese Stelle ist deaktiviert',
    closedText: 'Für diese Stelle nehmen wir zurzeit keine Bewerbungen an. Die Seite bleibt zur Information online.',
    notifyHint: 'Füllen Sie das Formular unten aus, um bei einer ähnlichen Stelle benachrichtigt zu werden.',
    closedHeading: 'Deaktivierte Stellen — keine Bewerbungen',
    closedOption: '{{title}} — deaktiviert',
    home: {
      eyebrow: 'Stellenangebote',
      title: 'Aktuelle Stellen in Deutschland',
      subtitle: 'Unsere echten Stellen: Beruf, Stadt, Gehalt, Deutschniveau und freie Plätze.',
      all: 'Alle Stellen',
    },
    admin: {
      active: 'Aktiv',
      inactive: 'Deaktiv',
      activate: 'Aktivieren',
      deactivate: 'Deaktivieren',
      toggleHint: 'Klicken: Stelle aktivieren oder deaktivieren',
      confirmTitle: 'Stelle deaktivieren?',
      confirmText: 'Die Stelle bleibt auf der Website sichtbar, als „Deaktiviert“. Neue Bewerbungen sind nicht möglich. Sie können sie jederzeit wieder aktivieren.',
      confirmBulkTitle: '{{count}} Stellen deaktivieren?',
      activated: 'Stelle aktiviert',
      deactivated: 'Stelle deaktiviert',
      bulkDone: '{{changed}} von {{total}} Stellen geändert',
      bulkSkipped: 'Nicht geändert: {{list}}',
      selected: '{{count}} ausgewählt',
      selectAll: 'Alle auswählen',
      select: 'Auswählen',
      clear: 'Auswahl aufheben',
      policyNote: 'Diese beiden Regeln gelten für alle Stellen. Eine einzelne Stelle aktivieren oder deaktivieren Sie in der Liste mit dem Schalter „Aktiv / Deaktiv“.',
      errors: {
        NOT_PUBLISHED: 'Entwürfe und Stellen in Prüfung zuerst freigeben',
        ALREADY_ACTIVE: 'Bereits aktiv',
        ALREADY_INACTIVE: 'Bereits deaktiviert',
        CLOSING_DATE_PASSED: 'Bewerbungsschluss vorbei — zuerst das Datum ändern',
        COMPANY_NOT_ACTIVE: 'Arbeitgeber ist nicht aktiv',
        VACANCY_NOT_FOUND: 'Stelle nicht gefunden',
      },
    },
  },
};

const en: Copy = {
  vacActive: {
    badge: 'Inactive',
    badgeLong: 'Inactive — not accepting applications',
    closedTitle: 'This vacancy is inactive',
    closedText: 'We are not accepting applications for this vacancy at the moment. The page stays online for information.',
    notifyHint: 'Fill in the form below to hear about a similar vacancy.',
    closedHeading: 'Inactive vacancies — not accepting applications',
    closedOption: '{{title}} — inactive',
    home: {
      eyebrow: 'Vacancies',
      title: 'Current vacancies in Germany',
      subtitle: 'Our real vacancies: profession, city, salary, German level and free places.',
      all: 'All vacancies',
    },
    admin: {
      active: 'Active',
      inactive: 'Inactive',
      activate: 'Activate',
      deactivate: 'Deactivate',
      toggleHint: 'Click to activate or deactivate the vacancy',
      confirmTitle: 'Deactivate the vacancy?',
      confirmText: 'The vacancy stays visible on the website, marked "Inactive". New applications are not possible. You can activate it again at any time.',
      confirmBulkTitle: 'Deactivate {{count}} vacancies?',
      activated: 'Vacancy activated',
      deactivated: 'Vacancy deactivated',
      bulkDone: '{{changed}} of {{total}} vacancies changed',
      bulkSkipped: 'Not changed: {{list}}',
      selected: '{{count}} selected',
      selectAll: 'Select all',
      select: 'Select',
      clear: 'Clear selection',
      policyNote: 'These two rules are policies for all vacancies. To activate or deactivate a single vacancy, use the "Active / Inactive" switch in the list.',
      errors: {
        NOT_PUBLISHED: 'Approve drafts and submissions first',
        ALREADY_ACTIVE: 'Already active',
        ALREADY_INACTIVE: 'Already inactive',
        CLOSING_DATE_PASSED: 'Closing date has passed — change the date first',
        COMPANY_NOT_ACTIVE: 'The employer is not active',
        VACANCY_NOT_FOUND: 'Vacancy not found',
      },
    },
  },
};

const ru: Copy = {
  vacActive: {
    badge: 'Неактивна',
    badgeLong: 'Неактивна — заявки не принимаются',
    closedTitle: 'Эта вакансия неактивна',
    closedText: 'Сейчас мы не принимаем заявки на эту вакансию. Страница остаётся на сайте для информации.',
    notifyHint: 'Заполните форму ниже, чтобы узнать о похожей вакансии.',
    closedHeading: 'Неактивные вакансии — заявки не принимаются',
    closedOption: '{{title}} — неактивна',
    home: {
      eyebrow: 'Вакансии',
      title: 'Актуальные вакансии в Германии',
      subtitle: 'Наши реальные вакансии: профессия, город, зарплата, уровень немецкого и свободные места.',
      all: 'Все вакансии',
    },
    admin: {
      active: 'Активна',
      inactive: 'Неактивна',
      activate: 'Активировать',
      deactivate: 'Деактивировать',
      toggleHint: 'Нажмите, чтобы активировать или деактивировать вакансию',
      confirmTitle: 'Деактивировать вакансию?',
      confirmText: 'Вакансия останется на сайте с пометкой «Неактивна». Новые заявки будут невозможны. Её можно снова активировать в любой момент.',
      confirmBulkTitle: 'Деактивировать вакансии: {{count}}?',
      activated: 'Вакансия активирована',
      deactivated: 'Вакансия деактивирована',
      bulkDone: 'Изменено {{changed}} из {{total}}',
      bulkSkipped: 'Не изменены: {{list}}',
      selected: 'Выбрано: {{count}}',
      selectAll: 'Выбрать все',
      select: 'Выбрать',
      clear: 'Снять выбор',
      policyNote: 'Эти два правила действуют для всех вакансий. Отдельную вакансию активируйте или деактивируйте переключателем «Активна / Неактивна» в списке.',
      errors: {
        NOT_PUBLISHED: 'Сначала одобрите черновик или вакансию на проверке',
        ALREADY_ACTIVE: 'Уже активна',
        ALREADY_INACTIVE: 'Уже неактивна',
        CLOSING_DATE_PASSED: 'Срок подачи прошёл — сначала измените дату',
        COMPANY_NOT_ACTIVE: 'Работодатель неактивен',
        VACANCY_NOT_FOUND: 'Вакансия не найдена',
      },
    },
  },
};

const tr: Copy = {
  vacActive: {
    ...en.vacActive,
    badge: 'Pasif',
    badgeLong: 'Pasif — başvuru alınmıyor',
    closedTitle: 'Bu ilan pasif',
    closedText: 'Bu ilana şu anda başvuru almıyoruz. Sayfa bilgi amaçlı sitede kalır.',
    notifyHint: 'Benzer bir ilan açıldığında haber almak için aşağıdaki formu doldurun.',
    closedHeading: 'Pasif ilanlar — başvuru alınmıyor',
    closedOption: '{{title}} — pasif',
    home: {
      eyebrow: 'İş ilanları',
      title: 'Almanya’da güncel iş ilanları',
      subtitle: 'Gerçek ilanlarımız: meslek, şehir, maaş, Almanca seviyesi ve boş yerler.',
      all: 'Tüm ilanlar',
    },
  },
};

const uk: Copy = {
  vacActive: {
    ...en.vacActive,
    badge: 'Неактивна',
    badgeLong: 'Неактивна — заявки не приймаються',
    closedTitle: 'Ця вакансія неактивна',
    closedText: 'Зараз ми не приймаємо заявки на цю вакансію. Сторінка залишається на сайті для інформації.',
    notifyHint: 'Заповніть форму нижче, щоб дізнатися про схожу вакансію.',
    closedHeading: 'Неактивні вакансії — заявки не приймаються',
    closedOption: '{{title}} — неактивна',
    home: {
      eyebrow: 'Вакансії',
      title: 'Актуальні вакансії в Німеччині',
      subtitle: 'Наші реальні вакансії: професія, місто, зарплата, рівень німецької та вільні місця.',
      all: 'Усі вакансії',
    },
  },
};

export const pagesVacancyActive = { az, de, en, ru, tr, uk };

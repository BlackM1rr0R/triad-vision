// Almaniya iş bazası, staff side: the listing block of an "apply via Triad Vision" lead (admin inquiries) and the
// job-source status panel (Admin → job channels). Registered with registerCopy(pagesGermanyJobsAdmin).

const az = {
  gja: {
    panel: {
      title: 'Xarici vakansiyaya müraciət',
      provider: { arbeitnow: 'Arbeitnow axtarışı', careerjet: 'Careerjet axtarışı', jooble: 'Jooble axtarışı', adzuna: 'Adzuna axtarışı', link: 'Göndərilmiş link' },
      open: 'Elanı aç',
      newTab: '(yeni pəncərədə açılır)',
      company: 'Şirkət',
      location: 'Yer',
      type: 'Növ',
      typeJob: 'İş',
      typeAusbildung: 'Ausbildung',
      german: 'Alman dili',
      profession: 'Peşə',
      experience: 'Təcrübə',
      years: '{{n}} il',
      cv: 'CV',
      noCv: 'CV əlavə edilməyib',
      download: 'CV-ni yüklə',
      account: 'Hesabdan göndərilib',
    },
    setup: {
      title: 'Almaniya iş bazası: mənbələr',
      intro: '/jobs/germany səhifəsində axtarılan pulsuz iş bazaları. Açarlar server .env faylındadır (server/.env.example, docs/GERMANY_JOBS.md).',
      on: 'Aktiv',
      off: 'Söndürülüb',
      needs: 'Lazımdır: {{env}}',
      lastFetch: 'Son yükləmə',
      items: '{{n}} elan yaddaşda',
      error: 'Son xəta: {{error}}',
      about: {
        arbeitnow: 'Pulsuz, açarsız; saatda bir dəfə yenilənir. Əsasən beynəlxalq vakansiyalar.',
        careerjet: 'Pulsuz publisher API (CAREERJET_API_KEY). Hər sorğu 30 dəq. keşlənir.',
        jooble: 'Pulsuz açar, gündə 100 sorğu. Yandırmazdan əvvəl Jooble-dan yazılı icazə lazımdır.',
        adzuna: 'Ödənişli (sınaqdan sonra). Yalnız ADZUNA_ENABLED=1 ilə.',
      },
    },
  },
};

type Copy = typeof az;

const de: Copy = {
  gja: {
    panel: {
      title: 'Bewerbung auf externe Stelle',
      provider: { arbeitnow: 'Arbeitnow-Suche', careerjet: 'Careerjet-Suche', jooble: 'Jooble-Suche', adzuna: 'Adzuna-Suche', link: 'Eingefügter Link' },
      open: 'Anzeige öffnen',
      newTab: '(öffnet in neuem Tab)',
      company: 'Unternehmen',
      location: 'Ort',
      type: 'Art',
      typeJob: 'Job',
      typeAusbildung: 'Ausbildung',
      german: 'Deutsch',
      profession: 'Beruf',
      experience: 'Erfahrung',
      years: '{{n}} Jahre',
      cv: 'Lebenslauf',
      noCv: 'Kein Lebenslauf angehängt',
      download: 'Lebenslauf herunterladen',
      account: 'Aus dem Kundenkonto gesendet',
    },
    setup: {
      title: 'Jobbörse Deutschland: Quellen',
      intro: 'Kostenlose Jobbörsen, die auf /jobs/germany durchsucht werden. Schlüssel in der Server-.env (server/.env.example, docs/GERMANY_JOBS.md).',
      on: 'Aktiv',
      off: 'Aus',
      needs: 'Benötigt: {{env}}',
      lastFetch: 'Letzter Abruf',
      items: '{{n}} Anzeigen im Speicher',
      error: 'Letzter Fehler: {{error}}',
      about: {
        arbeitnow: 'Kostenlos, ohne Schlüssel; stündlich aktualisiert. Vor allem internationale Stellen.',
        careerjet: 'Kostenlose Publisher-API (CAREERJET_API_KEY). Jede Suche 30 Min. im Cache.',
        jooble: 'Kostenloser Schlüssel, 100 Anfragen pro Tag. Vor dem Einschalten schriftliche Erlaubnis von Jooble nötig.',
        adzuna: 'Kostenpflichtig (nach dem Test). Nur mit ADZUNA_ENABLED=1.',
      },
    },
  },
};

const en: Copy = {
  gja: {
    panel: {
      title: 'Application for an external job',
      provider: { arbeitnow: 'Arbeitnow search', careerjet: 'Careerjet search', jooble: 'Jooble search', adzuna: 'Adzuna search', link: 'Pasted link' },
      open: 'Open listing',
      newTab: '(opens in a new tab)',
      company: 'Company',
      location: 'Location',
      type: 'Type',
      typeJob: 'Job',
      typeAusbildung: 'Ausbildung',
      german: 'German',
      profession: 'Profession',
      experience: 'Experience',
      years: '{{n}} years',
      cv: 'CV',
      noCv: 'No CV attached',
      download: 'Download CV',
      account: 'Sent from the client account',
    },
    setup: {
      title: 'Germany job search: sources',
      intro: 'Free job boards searched on /jobs/germany. Keys live in the server .env (server/.env.example, docs/GERMANY_JOBS.md).',
      on: 'On',
      off: 'Off',
      needs: 'Needs: {{env}}',
      lastFetch: 'Last fetch',
      items: '{{n}} listings in memory',
      error: 'Last error: {{error}}',
      about: {
        arbeitnow: 'Free, no key; refreshed hourly. Mostly international roles.',
        careerjet: 'Free publisher API (CAREERJET_API_KEY). Each search cached for 30 min.',
        jooble: 'Free key, 100 calls per day. Needs written permission from Jooble before switching on.',
        adzuna: 'Paid (after the trial). Only with ADZUNA_ENABLED=1.',
      },
    },
  },
};

const ru: Copy = {
  gja: {
    panel: {
      title: 'Заявка на внешнюю вакансию',
      provider: { arbeitnow: 'Поиск Arbeitnow', careerjet: 'Поиск Careerjet', jooble: 'Поиск Jooble', adzuna: 'Поиск Adzuna', link: 'Вставленная ссылка' },
      open: 'Открыть объявление',
      newTab: '(откроется в новой вкладке)',
      company: 'Компания',
      location: 'Место',
      type: 'Тип',
      typeJob: 'Работа',
      typeAusbildung: 'Ausbildung',
      german: 'Немецкий',
      profession: 'Профессия',
      experience: 'Опыт',
      years: '{{n}} лет',
      cv: 'Резюме',
      noCv: 'Резюме не приложено',
      download: 'Скачать резюме',
      account: 'Отправлено из аккаунта клиента',
    },
    setup: {
      title: 'Поиск работы в Германии: источники',
      intro: 'Бесплатные базы вакансий, по которым ищет /jobs/germany. Ключи — в .env сервера (server/.env.example, docs/GERMANY_JOBS.md).',
      on: 'Вкл.',
      off: 'Выкл.',
      needs: 'Нужно: {{env}}',
      lastFetch: 'Последняя загрузка',
      items: 'В памяти объявлений: {{n}}',
      error: 'Последняя ошибка: {{error}}',
      about: {
        arbeitnow: 'Бесплатно, без ключа; обновляется раз в час. В основном международные вакансии.',
        careerjet: 'Бесплатный publisher API (CAREERJET_API_KEY). Каждый поиск кешируется 30 мин.',
        jooble: 'Бесплатный ключ, 100 запросов в день. Перед включением нужно письменное разрешение Jooble.',
        adzuna: 'Платно (после теста). Только с ADZUNA_ENABLED=1.',
      },
    },
  },
};

export const pagesGermanyJobsAdmin = { az, de, en, ru };

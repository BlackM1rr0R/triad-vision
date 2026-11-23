// Visual / animated extras: vacancy places bar, document readiness ring, waiting-time bar (case view),
// city budget bars (cities calculator) and the home counters (placed workers, active vacancies).
// Registered with registerCopy(pagesVisualPlus). Figures shown with this copy are estimates or real counts, never invented.

const az = {
  vizp: {
    places: {
      bar: '{{positions}} yerdən {{free}} yer qalıb',
      barFull: '{{positions}} yerin hamısı tutulub',
      aria: 'Yerlər: {{filled}} / {{positions}} tutulub, {{free}} boş',
    },
    ring: {
      aria: 'Məcburi sənədlər: {{done}} / {{total}} yüklənib',
      ready: 'Hamısı hazırdır',
    },
    wait: {
      step: { APPOINTMENT: 'Səfirlik görüşü vaxtının verilməsi', DECISION: 'Səfirlik qərarı' },
      line: '{{step}} adətən {{range}} {{unit}} çəkir.',
      weeks: 'həftə',
      days: 'gün',
      elapsed: 'Gözləmə vaxtı: {{elapsed}}',
      weeksCount: '{{count}} həftə',
      daysCount: '{{count}} gün',
      state: {
        early: 'Gözləmə təzə başlayıb.',
        within: 'Hələ adi müddətin içindəsiniz.',
        over: 'Adi müddətdən çox çəkir. Sualınız varsa, meneceriniz sizə kömək edər.',
      },
      note: 'Təxmini müddətdir: səfirlik və idarələrin iş yükü onu dəyişə bilər.',
      aria: 'Gözləmə: {{elapsed}}, adi müddət {{range}} {{unit}}',
    },
    chart: {
      title: 'Xalis maaş və xərclər',
      approx: 'Təxmini, aylıq',
      other: 'Digər xərclər',
      aria: '{{city}}: {{summary}}. Təxmini aylıq rəqəmlər (aralığın ortası).',
      note: 'Xərclər aralığın ortası kimi götürülüb. Bu təxmini hesabdır, dəqiq rəqəm deyil.',
    },
    home: {
      placed: 'Almaniyada işə yerləşdirilmiş işçi',
      vacancies: 'Aktiv vakansiya',
      note: 'Rəqəmlər real məlumatdan götürülür. Şəxsi məlumat göstərilmir.',
      seeJobs: 'Vakansiyalara baxın',
      aria: 'İşə yerləşdirilmiş işçilər: {{placed}}. Aktiv vakansiyalar: {{vacancies}}.',
    },
  },
};

const de: typeof az = {
  vizp: {
    places: {
      bar: 'Noch {{free}} von {{positions}} Plätzen frei',
      barFull: 'Alle {{positions}} Plätze sind vergeben',
      aria: 'Plätze: {{filled}} von {{positions}} vergeben, {{free}} frei',
    },
    ring: {
      aria: 'Pflichtdokumente: {{done}} von {{total}} hochgeladen',
      ready: 'Alles bereit',
    },
    wait: {
      step: { APPOINTMENT: 'Vergabe des Botschaftstermins', DECISION: 'Entscheidung der Botschaft' },
      line: '{{step}} dauert in der Regel {{range}} {{unit}}.',
      weeks_one: 'Woche',
      weeks_other: 'Wochen',
      days_one: 'Tag',
      days_other: 'Tage',
      elapsed: 'Wartezeit: {{elapsed}}',
      weeksCount_one: '{{count}} Woche',
      weeksCount_other: '{{count}} Wochen',
      daysCount_one: '{{count}} Tag',
      daysCount_other: '{{count}} Tage',
      state: {
        early: 'Die Wartezeit hat gerade begonnen.',
        within: 'Sie liegen noch im üblichen Zeitraum.',
        over: 'Es dauert länger als üblich. Bei Fragen hilft Ihnen Ihr Berater.',
      },
      note: 'Eine Schätzung: Die Auslastung von Botschaft und Behörden kann die Dauer verändern.',
      aria: 'Wartezeit: {{elapsed}}, üblicher Zeitraum {{range}} {{unit}}',
    },
    chart: {
      title: 'Nettogehalt und Kosten',
      approx: 'Geschätzt, pro Monat',
      other: 'Übrige Kosten',
      aria: '{{city}}: {{summary}}. Geschätzte Monatswerte (Mitte der Spanne).',
      note: 'Die Kosten sind die Mitte der Spanne. Das ist eine Schätzung, kein genauer Wert.',
    },
    home: {
      placed: 'Fachkräfte in Deutschland vermittelt',
      vacancies: 'Aktive Stellen',
      note: 'Die Zahlen stammen aus echten Daten. Personenbezogene Daten werden nicht angezeigt.',
      seeJobs: 'Stellen ansehen',
      aria: 'Vermittelte Fachkräfte: {{placed}}. Aktive Stellen: {{vacancies}}.',
    },
  },
} as never;

const en: typeof az = {
  vizp: {
    places: {
      bar: '{{free}} of {{positions}} places left',
      barFull: 'All {{positions}} places are taken',
      aria: 'Places: {{filled}} of {{positions}} taken, {{free}} free',
    },
    ring: {
      aria: 'Required documents: {{done}} of {{total}} uploaded',
      ready: 'All ready',
    },
    wait: {
      step: { APPOINTMENT: 'Embassy appointment being given', DECISION: 'The embassy decision' },
      line: '{{step}} usually takes {{range}} {{unit}}.',
      weeks_one: 'week',
      weeks_other: 'weeks',
      days_one: 'day',
      days_other: 'days',
      elapsed: 'Waiting for: {{elapsed}}',
      weeksCount_one: '{{count}} week',
      weeksCount_other: '{{count}} weeks',
      daysCount_one: '{{count}} day',
      daysCount_other: '{{count}} days',
      state: {
        early: 'The wait has only just started.',
        within: 'You are still within the usual time.',
        over: 'It is taking longer than usual. If you have questions, your manager can help.',
      },
      note: 'This is an estimate: the workload of the embassy and the offices can change it.',
      aria: 'Waiting for {{elapsed}}, usual time {{range}} {{unit}}',
    },
    chart: {
      title: 'Net salary and costs',
      approx: 'Estimate, per month',
      other: 'Other costs',
      aria: '{{city}}: {{summary}}. Estimated monthly figures (middle of the range).',
      note: 'Costs are the middle of the range. This is an estimate, not an exact figure.',
    },
    home: {
      placed: 'Workers placed in Germany',
      vacancies: 'Active vacancies',
      note: 'The numbers come from real data. No personal data is shown.',
      seeJobs: 'See vacancies',
      aria: 'Workers placed: {{placed}}. Active vacancies: {{vacancies}}.',
    },
  },
} as never;

const ru: typeof az = {
  vizp: {
    places: {
      bar: 'Осталось {{free}} из {{positions}} мест',
      barFull: 'Все {{positions}} мест заняты',
      aria: 'Места: занято {{filled}} из {{positions}}, свободно {{free}}',
    },
    ring: {
      aria: 'Обязательные документы: загружено {{done}} из {{total}}',
      ready: 'Всё готово',
    },
    wait: {
      step: { APPOINTMENT: 'Назначение записи в посольстве', DECISION: 'Решение посольства' },
      line: '{{step}}: обычно {{range}} {{unit}}.',
      weeks: 'нед.',
      days: 'дн.',
      elapsed: 'Вы ждёте: {{elapsed}}',
      weeksCount: '{{count}} нед.',
      daysCount: '{{count}} дн.',
      state: {
        early: 'Ожидание только началось.',
        within: 'Вы пока в пределах обычного срока.',
        over: 'Это занимает дольше обычного. Если есть вопросы, поможет ваш менеджер.',
      },
      note: 'Это оценка: загруженность посольства и ведомств может изменить срок.',
      aria: 'Ожидание: {{elapsed}}, обычный срок {{range}} {{unit}}',
    },
    chart: {
      title: 'Чистая зарплата и расходы',
      approx: 'Оценка, в месяц',
      other: 'Прочие расходы',
      aria: '{{city}}: {{summary}}. Ориентировочные месячные суммы (середина диапазона).',
      note: 'Расходы взяты как середина диапазона. Это оценка, а не точная сумма.',
    },
    home: {
      placed: 'Работников трудоустроено в Германии',
      vacancies: 'Активных вакансий',
      note: 'Цифры берутся из реальных данных. Личные данные не показываются.',
      seeJobs: 'Смотреть вакансии',
      aria: 'Трудоустроено работников: {{placed}}. Активных вакансий: {{vacancies}}.',
    },
  },
} as never;

const tr: typeof az = {
  vizp: {
    places: {
      bar: '{{positions}} yerden {{free}} yer kaldı',
      barFull: '{{positions}} yerin hepsi dolu',
      aria: 'Yerler: {{filled}} / {{positions}} dolu, {{free}} boş',
    },
    ring: {
      aria: 'Zorunlu belgeler: {{done}} / {{total}} yüklendi',
      ready: 'Hepsi hazır',
    },
    wait: {
      step: { APPOINTMENT: 'Büyükelçilik randevusunun verilmesi', DECISION: 'Büyükelçilik kararı' },
      line: '{{step}} genellikle {{range}} {{unit}} sürer.',
      weeks: 'hafta',
      days: 'gün',
      elapsed: 'Bekleme süresi: {{elapsed}}',
      weeksCount: '{{count}} hafta',
      daysCount: '{{count}} gün',
      state: {
        early: 'Bekleme yeni başladı.',
        within: 'Henüz olağan sürenin içindesiniz.',
        over: 'Olağandan uzun sürüyor. Sorunuz varsa danışmanınız yardımcı olur.',
      },
      note: 'Tahmini bir süredir: büyükelçiliğin ve kurumların iş yükü süreyi değiştirebilir.',
      aria: 'Bekleme: {{elapsed}}, olağan süre {{range}} {{unit}}',
    },
    chart: {
      title: 'Net maaş ve giderler',
      approx: 'Tahmini, aylık',
      other: 'Diğer giderler',
      aria: '{{city}}: {{summary}}. Tahmini aylık rakamlar (aralığın ortası).',
      note: 'Giderler aralığın ortası olarak alındı. Bu tahmini bir hesaptır, kesin rakam değildir.',
    },
    home: {
      placed: 'Almanya’da işe yerleştirilen çalışan',
      vacancies: 'Aktif ilan',
      note: 'Rakamlar gerçek verilerden alınır. Kişisel veri gösterilmez.',
      seeJobs: 'İlanlara bak',
      aria: 'İşe yerleştirilen çalışanlar: {{placed}}. Aktif ilanlar: {{vacancies}}.',
    },
  },
} as never;

const uk: typeof az = {
  vizp: {
    places: {
      bar: 'Залишилося {{free}} з {{positions}} місць',
      barFull: 'Усі {{positions}} місць зайняті',
      aria: 'Місця: зайнято {{filled}} з {{positions}}, вільно {{free}}',
    },
    ring: {
      aria: 'Обов’язкові документи: завантажено {{done}} з {{total}}',
      ready: 'Усе готово',
    },
    wait: {
      step: { APPOINTMENT: 'Призначення запису в посольстві', DECISION: 'Рішення посольства' },
      line: '{{step}}: зазвичай {{range}} {{unit}}.',
      weeks: 'тижн.',
      days: 'дн.',
      elapsed: 'Ви чекаєте: {{elapsed}}',
      weeksCount: '{{count}} тижн.',
      daysCount: '{{count}} дн.',
      state: {
        early: 'Очікування щойно почалося.',
        within: 'Ви поки в межах звичайного строку.',
        over: 'Це триває довше, ніж зазвичай. Якщо є запитання, допоможе ваш менеджер.',
      },
      note: 'Це оцінка: завантаженість посольства й відомств може змінити строк.',
      aria: 'Очікування: {{elapsed}}, звичайний строк {{range}} {{unit}}',
    },
    chart: {
      title: 'Чиста зарплата та витрати',
      approx: 'Оцінка, на місяць',
      other: 'Інші витрати',
      aria: '{{city}}: {{summary}}. Орієнтовні місячні суми (середина діапазону).',
      note: 'Витрати взято як середину діапазону. Це оцінка, а не точна сума.',
    },
    home: {
      placed: 'Працівників працевлаштовано в Німеччині',
      vacancies: 'Активних вакансій',
      note: 'Цифри беруться з реальних даних. Особисті дані не показуються.',
      seeJobs: 'Дивитися вакансії',
      aria: 'Працевлаштовано працівників: {{placed}}. Активних вакансій: {{vacancies}}.',
    },
  },
} as never;

export const pagesVisualPlus = { az, de, en, ru, tr, uk };

/** Texts of the "Germany Ready" practice certificate PDF and its notification (az / de / en / ru). */

export const READY_LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type ReadyLocale = (typeof READY_LOCALES)[number];
export const asReadyLocale = (v: unknown): ReadyLocale => ((READY_LOCALES as readonly unknown[]).includes(v) ? (v as ReadyLocale) : 'de');
export const READY_DATE_LOCALE: Record<ReadyLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

export interface ReadyCertTexts {
  kicker: string;
  heading: string;
  intro: string;
  body: (activities: number, points: number, max: number) => string;
  level: Record<'BRONZE' | 'SILVER' | 'GOLD', string>;
  levelLabel: string;
  date: string;
  number: string;
  verify: string;
  team: string;
  note: string;
  notifyTitle: string;
  notifyBody: (level: string) => string;
}

export const READY_TEXTS: Record<ReadyLocale, ReadyCertTexts> = {
  az: {
    kicker: 'Təcrübə nailiyyətləri',
    heading: 'Germany Ready',
    intro: 'Bu sertifikat təsdiq edir ki,',
    body: (n, p, m) => `Triad Vision təlim oyunlarında və məşqlərində ${n} fəaliyyəti tamamlayıb (${p} / ${m} xal)`,
    level: { BRONZE: 'Bürünc', SILVER: 'Gümüş', GOLD: 'Qızıl' },
    levelLabel: 'Səviyyə',
    date: 'Tarix',
    number: 'Sertifikat nömrəsi',
    verify: 'Yoxlama',
    team: 'Triad Vision komandası',
    note: 'Təcrübə nailiyyətləri — rəsmi imtahan və ya dil sertifikatı deyil. Nəticələri iştirakçı özü onlayn məşqlərdə əldə edib.',
    notifyTitle: '«Germany Ready» sertifikatınız hazırdır',
    notifyBody: (l) => `Təbrik edirik! Təcrübə nailiyyətləriniz «${l}» səviyyəsinə çatdı. Sertifikatı kabinetdə endirə bilərsiniz.`,
  },
  de: {
    kicker: 'Praxis-Erfolge',
    heading: 'Germany Ready',
    intro: 'Hiermit bestätigen wir, dass',
    body: (n, p, m) => `${n} Übungen der Triad Vision Lernspiele und Trainings abgeschlossen hat (${p} von ${m} Punkten)`,
    level: { BRONZE: 'Bronze', SILVER: 'Silber', GOLD: 'Gold' },
    levelLabel: 'Stufe',
    date: 'Datum',
    number: 'Urkundennummer',
    verify: 'Echtheit prüfen',
    team: 'Das Triad Vision Team',
    note: 'Praxis-Erfolge — keine Prüfung und kein Sprachzertifikat. Die Ergebnisse wurden selbstständig in Online-Übungen erzielt.',
    notifyTitle: 'Ihre „Germany Ready“-Urkunde ist da',
    notifyBody: (l) => `Herzlichen Glückwunsch! Ihre Praxis-Erfolge haben die Stufe „${l}“ erreicht. Die Urkunde können Sie im Portal herunterladen.`,
  },
  en: {
    kicker: 'Practice achievements',
    heading: 'Germany Ready',
    intro: 'This is to certify that',
    body: (n, p, m) => `has completed ${n} activities of the Triad Vision learning games and trainings (${p} of ${m} points)`,
    level: { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold' },
    levelLabel: 'Level',
    date: 'Date',
    number: 'Certificate number',
    verify: 'Verify',
    team: 'The Triad Vision team',
    note: 'Practice achievements — not an exam and not a language certificate. Results were achieved independently in online exercises.',
    notifyTitle: 'Your “Germany Ready” certificate is ready',
    notifyBody: (l) => `Congratulations! Your practice achievements reached the “${l}” level. You can download the certificate in your portal.`,
  },
  ru: {
    kicker: 'Практические достижения',
    heading: 'Germany Ready',
    intro: 'Настоящим подтверждаем, что',
    body: (n, p, m) => `выполнил(а) ${n} заданий в обучающих играх и тренажёрах Triad Vision (${p} из ${m} баллов)`,
    level: { BRONZE: 'Бронза', SILVER: 'Серебро', GOLD: 'Золото' },
    levelLabel: 'Уровень',
    date: 'Дата',
    number: 'Номер сертификата',
    verify: 'Проверка',
    team: 'Команда Triad Vision',
    note: 'Практические достижения — не экзамен и не языковой сертификат. Результаты получены самостоятельно в онлайн-упражнениях.',
    notifyTitle: 'Ваш сертификат «Germany Ready» готов',
    notifyBody: (l) => `Поздравляем! Ваши практические достижения достигли уровня «${l}». Сертификат можно скачать в портале.`,
  },
};

/** Employer one-pager rows (readiness profile, only with the client's consent). */
export const PROFILE_TEXTS: Record<ReadyLocale, { readiness: string; german: string; mock: (level: string, pct: number) => string; ready: string; readyYes: string; readyNo: string; scene: string; interview: string; yes: string; no: string; band: string; practice: string }> = {
  az: { readiness: 'Hazırlıq balı', german: 'Alman dili səviyyəsi', mock: (l, p) => `Sınaq imtahanı ${l}: ən yaxşı ${p} % (məşq testi)`, ready: 'Germany Ready', readyYes: 'var', readyNo: 'hələ yoxdur', scene: 'İş səhnəsi (peşə üzrə)', interview: 'Müsahibə hazırlığı', yes: 'keçib', no: 'hələ yox', band: 'Hazırlıq balı (diapazon)', practice: 'Tamamlanmış məşqlər (diapazon)' },
  de: { readiness: 'Vorbereitungs-Score', german: 'Deutschniveau', mock: (l, p) => `Modelltest ${l}: bestes Ergebnis ${p} % (Übungstest)`, ready: 'Germany Ready', readyYes: 'ja', readyNo: 'noch nicht', scene: 'Arbeitsszene (Beruf)', interview: 'Interview-Training', yes: 'geübt', no: 'noch nicht', band: 'Vorbereitungs-Score (Bereich)', practice: 'Abgeschlossene Übungen (Bereich)' },
  en: { readiness: 'Readiness score', german: 'German level', mock: (l, p) => `Mock exam ${l}: best ${p} % (practice test)`, ready: 'Germany Ready', readyYes: 'yes', readyNo: 'not yet', scene: 'Work scene (profession)', interview: 'Interview practice', yes: 'practised', no: 'not yet', band: 'Readiness score (band)', practice: 'Completed practice activities (band)' },
  ru: { readiness: 'Балл готовности', german: 'Уровень немецкого', mock: (l, p) => `Пробный экзамен ${l}: лучший результат ${p} % (тренировочный тест)`, ready: 'Germany Ready', readyYes: 'да', readyNo: 'пока нет', scene: 'Рабочая сцена (профессия)', interview: 'Подготовка к собеседованию', yes: 'пройдено', no: 'пока нет', band: 'Балл готовности (диапазон)', practice: 'Выполненные упражнения (диапазон)' },
};

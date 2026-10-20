/**
 * Four-language texts of the deterministic case AI rules. AI findings bring their own four messages; rule
 * findings are rendered here from a code + params so they never depend on the model.
 */

export type L10n = { az: string; de: string; en: string; ru: string };
export const LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type Lang = (typeof LOCALES)[number];

type P = Record<string, string | number>;
const fill = (s: string, p: P) => s.replace(/\{(\w+)\}/g, (_, k: string) => (p[k] === undefined ? `{${k}}` : String(p[k])));
const tpl = (az: string, de: string, en: string, ru: string) => (p: P = {}): L10n => ({ az: fill(az, p), de: fill(de, p), en: fill(en, p), ru: fill(ru, p) });

// ─── Consistency rules ───────────────────────────────────────────────

export const RULE = {
  PASSPORT_EXPIRED: tpl(
    'Pasportun müddəti bitib ({expiry}). Viza üçün yeni pasport lazımdır.',
    'Der Reisepass ist abgelaufen ({expiry}). Für das Visum ist ein neuer Pass nötig.',
    'The passport has expired ({expiry}). A new passport is needed for the visa.',
    'Срок действия паспорта истёк ({expiry}). Для визы нужен новый паспорт.',
  ),
  PASSPORT_EXPIRY_SHORT: tpl(
    'Pasport {expiry} tarixinə qədər etibarlıdır — planlaşdırılan girişdən ({entry}) sonra 6 aydan az qalır.',
    'Der Reisepass gilt bis {expiry} — weniger als 6 Monate nach der geplanten Einreise ({entry}).',
    'The passport is valid until {expiry} — less than 6 months after the planned entry ({entry}).',
    'Паспорт действителен до {expiry} — менее 6 месяцев после планируемого въезда ({entry}).',
  ),
  PASSPORT_EXPIRY_UNKNOWN: tpl(
    'Pasportun etibarlılıq müddəti məlum deyil (profildə və sənədlərdə yoxdur).',
    'Das Ablaufdatum des Reisepasses ist unbekannt (weder im Profil noch in den Dokumenten).',
    'The passport expiry date is unknown (not in the profile or the documents).',
    'Срок действия паспорта неизвестен (нет ни в профиле, ни в документах).',
  ),
  PASSPORT_EXPIRY_MISMATCH: tpl(
    'Profildəki pasport müddəti ({profile}) pasportdakı ilə ({doc}) üst-üstə düşmür.',
    'Das Pass-Ablaufdatum im Profil ({profile}) weicht vom Pass ab ({doc}).',
    'The passport expiry in the profile ({profile}) differs from the passport ({doc}).',
    'Срок паспорта в профиле ({profile}) не совпадает с паспортом ({doc}).',
  ),
  PASSPORT_EXPIRY_PROFILE_EMPTY: tpl(
    'Profildə pasport müddəti yoxdur; pasportda: {doc}.',
    'Im Profil fehlt das Pass-Ablaufdatum; laut Pass: {doc}.',
    'The profile has no passport expiry; the passport says {doc}.',
    'В профиле нет срока паспорта; в паспорте: {doc}.',
  ),
  PASSPORT_NUMBER_MISMATCH: tpl(
    'Profildəki pasport nömrəsi ({profile}) sənəddəki ilə ({doc}) fərqlidir.',
    'Die Passnummer im Profil ({profile}) weicht vom Dokument ab ({doc}).',
    'The passport number in the profile ({profile}) differs from the document ({doc}).',
    'Номер паспорта в профиле ({profile}) отличается от документа ({doc}).',
  ),
  PASSPORT_NUMBER_PROFILE_EMPTY: tpl(
    'Profildə pasport nömrəsi yoxdur; pasportda: {doc}.',
    'Im Profil fehlt die Passnummer; laut Pass: {doc}.',
    'The profile has no passport number; the passport says {doc}.',
    'В профиле нет номера паспорта; в паспорте: {doc}.',
  ),
  BIRTHDATE_MISMATCH: tpl(
    'Doğum tarixi profildə {profile}, “{doc}” sənədində isə {value}.',
    'Geburtsdatum im Profil {profile}, im Dokument „{doc}“ aber {value}.',
    'Date of birth is {profile} in the profile but {value} in “{doc}”.',
    'Дата рождения в профиле {profile}, а в документе «{doc}» — {value}.',
  ),
  BIRTHDATE_PROFILE_EMPTY: tpl(
    'Profildə doğum tarixi yoxdur; “{doc}” sənədində: {value}.',
    'Im Profil fehlt das Geburtsdatum; laut „{doc}“: {value}.',
    'The profile has no date of birth; “{doc}” says {value}.',
    'В профиле нет даты рождения; в «{doc}»: {value}.',
  ),
  NAME_MISMATCH: tpl(
    'Ad “{doc}” sənədində ({value}) profildəki adla ({profile}) uyğun gəlmir.',
    'Der Name in „{doc}“ ({value}) passt nicht zum Profil ({profile}).',
    'The name in “{doc}” ({value}) does not match the profile ({profile}).',
    'Имя в «{doc}» ({value}) не совпадает с профилем ({profile}).',
  ),
  NAME_LATIN_VARIANT: tpl(
    'Pasportda ad latın hərfləri ilə “{value}” yazılıb (profildə “{profile}”). VIDEX, müqavilə və tərcümələrdə pasportdakı yazılış istifadə olunmalıdır.',
    'Im Pass lautet der Name in lateinischer Schreibweise „{value}“ (Profil: „{profile}“). VIDEX, Vertrag und Übersetzungen müssen die Pass-Schreibweise verwenden.',
    'The passport spells the name “{value}” in Latin letters (profile: “{profile}”). VIDEX, contract and translations must use the passport spelling.',
    'В паспорте имя латиницей — «{value}» (в профиле «{profile}»). В VIDEX, договоре и переводах нужно писать как в паспорте.',
  ),
  MISSING_DOCUMENT: tpl(
    'Məcburi sənəd çatışmır: {title}.',
    'Pflichtdokument fehlt: {title}.',
    'Required document missing: {title}.',
    'Не хватает обязательного документа: {title}.',
  ),
  REJECTED_DOCUMENT: tpl(
    'Sənəd rədd edilib və yenisi yüklənməyib: {title}.',
    'Dokument abgelehnt und noch nicht neu hochgeladen: {title}.',
    'Document rejected and not uploaded again yet: {title}.',
    'Документ отклонён, новый ещё не загружен: {title}.',
  ),
  NO_PASSPORT_DOCUMENT: tpl(
    'Müraciətdə pasport skanı yoxdur.',
    'Im Antrag fehlt ein Scan des Reisepasses.',
    'The case has no passport scan.',
    'В заявке нет скана паспорта.',
  ),
  DOCUMENT_EXPIRES_BEFORE_ENTRY: tpl(
    '“{doc}” sənədinin müddəti ({expiry}) planlaşdırılan girişdən ({entry}) əvvəl bitir.',
    '„{doc}“ läuft vor der geplanten Einreise ab ({expiry}, Einreise {entry}).',
    '“{doc}” expires ({expiry}) before the planned entry ({entry}).',
    'Срок «{doc}» ({expiry}) истекает до планируемого въезда ({entry}).',
  ),
  GERMAN_LEVEL_LOW: tpl(
    'Viza növü üçün ən azı {required} alman dili lazımdır; profildə: {level}.',
    'Für die Visumart ist mindestens Deutsch {required} nötig; im Profil: {level}.',
    'The visa type needs at least German {required}; the profile says {level}.',
    'Для этого типа визы нужен немецкий не ниже {required}; в профиле: {level}.',
  ),
  NATIONALITY_MISSING: tpl(
    'Profildə vətəndaşlıq qeyd olunmayıb.',
    'Im Profil fehlt die Staatsangehörigkeit.',
    'The profile has no nationality.',
    'В профиле не указано гражданство.',
  ),
  NATIONALITY_PROFILE_EMPTY: tpl(
    'Profildə vətəndaşlıq yoxdur; pasportda: {doc}.',
    'Im Profil fehlt die Staatsangehörigkeit; laut Pass: {doc}.',
    'The profile has no nationality; the passport says {doc}.',
    'В профиле нет гражданства; в паспорте: {doc}.',
  ),
};

export type RuleCode = keyof typeof RULE;

// ─── Contract rules ──────────────────────────────────────────────────

export const CONTRACT = {
  BELOW_MINIMUM_WAGE: tpl(
    'Saatlıq əmək haqqı təxminən {hourly} € — {year} üçün Almaniyada minimum əmək haqqından ({min} €) aşağıdır. Belə müqavilə ilə viza verilmir.',
    'Der Stundenlohn liegt bei ca. {hourly} € und damit unter dem gesetzlichen Mindestlohn {year} ({min} €). Mit diesem Vertrag wird kein Visum erteilt.',
    'The hourly wage is about €{hourly}, below the German statutory minimum wage for {year} (€{min}). No visa will be issued with this contract.',
    'Почасовая оплата около {hourly} € — ниже минимальной зарплаты в Германии на {year} год ({min} €). С таким договором визу не выдадут.',
  ),
  SALARY_MISSING: tpl(
    'Müqavilədə aylıq brutto əmək haqqı tapılmadı.',
    'Im Vertrag wurde kein Bruttomonatsgehalt gefunden.',
    'No gross monthly salary was found in the contract.',
    'В договоре не найдена месячная зарплата брутто.',
  ),
  SALARY_BELOW_CATEGORY: tpl(
    'Əmək haqqı ({salary} €) bu viza növü üçün gözlənilən minimumdan ({min} €) aşağıdır.',
    'Das Gehalt ({salary} €) liegt unter dem für diese Visumart erwarteten Minimum ({min} €).',
    'The salary (€{salary}) is below the minimum expected for this visa type (€{min}).',
    'Зарплата ({salary} €) ниже ожидаемого минимума для этого типа визы ({min} €).',
  ),
  SALARY_ABOVE_CATEGORY: tpl(
    'Əmək haqqı ({salary} €) bu viza növü üçün adi diapazondan ({max} €) yuxarıdır — rəqəmi yoxlayın.',
    'Das Gehalt ({salary} €) liegt über der üblichen Spanne der Visumart ({max} €) — bitte prüfen.',
    'The salary (€{salary}) is above the usual range for this visa type (€{max}) — please check.',
    'Зарплата ({salary} €) выше обычного диапазона для этой визы ({max} €) — проверьте.',
  ),
  SALARY_BELOW_VACANCY: tpl(
    'Əmək haqqı ({salary} €) vakansiyada vəd ediləndən ({min} €) azdır.',
    'Das Gehalt ({salary} €) liegt unter dem Angebot der Stelle ({min} €).',
    'The salary (€{salary}) is lower than the vacancy offered (€{min}).',
    'Зарплата ({salary} €) ниже, чем в вакансии ({min} €).',
  ),
  BLUE_CARD_BELOW: tpl(
    'İllik əmək haqqı ({yearly} €) {year} üçün Mavi Kart həddindən ({min} €) aşağıdır.',
    'Das Jahresgehalt ({yearly} €) liegt unter der Blue-Card-Grenze {year} ({min} €).',
    'The yearly salary (€{yearly}) is below the {year} Blue Card threshold (€{min}).',
    'Годовая зарплата ({yearly} €) ниже порога Голубой карты на {year} год ({min} €).',
  ),
  BLUE_CARD_SHORTAGE_ONLY: tpl(
    'İllik əmək haqqı ({yearly} €) yalnız çatışmayan peşələr / yeni məzunlar üçün azaldılmış Mavi Kart həddinə ({min} €) çatır — peşənin siyahıda olduğunu yoxlayın.',
    'Das Jahresgehalt ({yearly} €) erreicht nur die abgesenkte Blue-Card-Grenze ({min} €) für Engpassberufe / Berufseinsteiger — bitte prüfen, ob der Beruf darunter fällt.',
    'The yearly salary (€{yearly}) only reaches the reduced Blue Card threshold (€{min}) for shortage occupations / new entrants — check that the job qualifies.',
    'Годовая зарплата ({yearly} €) достигает только сниженного порога Голубой карты ({min} €) для дефицитных профессий / молодых специалистов — проверьте профессию.',
  ),
  OLDER_WORKER_SALARY: tpl(
    'Namizəd 45 yaşdan böyükdür: illik əmək haqqı ({yearly} €) {year} həddindən ({min} €) aşağıdır — kifayət qədər pensiya təminatının sübutu lazımdır.',
    'Die Person ist 45 oder älter: Das Jahresgehalt ({yearly} €) liegt unter der Grenze {year} ({min} €) — ein Nachweis angemessener Altersversorgung ist nötig.',
    'The candidate is 45 or older: the yearly salary (€{yearly}) is below the {year} threshold (€{min}) — proof of adequate pension provision is needed.',
    'Кандидату 45 лет или больше: годовая зарплата ({yearly} €) ниже порога {year} ({min} €) — нужно подтверждение пенсионного обеспечения.',
  ),
  HOURS_TOO_HIGH: tpl(
    'Həftəlik iş saatı ({hours}) qanuni maksimumdan (48) çoxdur.',
    'Die Wochenarbeitszeit ({hours} Std.) überschreitet das gesetzliche Maximum von 48 Stunden.',
    'Weekly hours ({hours}) exceed the legal maximum of 48.',
    'Рабочая неделя ({hours} ч) превышает законный максимум 48 часов.',
  ),
  HOURS_TOO_LOW: tpl(
    'Həftəlik iş saatı ({hours}) 20-dən azdır — iş vizası üçün adətən tam iş günü tələb olunur.',
    'Die Wochenarbeitszeit ({hours} Std.) liegt unter 20 Stunden — für das Arbeitsvisum ist in der Regel Vollzeit nötig.',
    'Weekly hours ({hours}) are below 20 — a work visa usually needs full-time employment.',
    'Рабочая неделя ({hours} ч) меньше 20 часов — для рабочей визы обычно нужна полная занятость.',
  ),
  HOURS_MISSING: tpl(
    'Həftəlik iş saatı tapılmadı (40 saat qəbul edilib).',
    'Keine Wochenarbeitszeit gefunden (40 Stunden angenommen).',
    'No weekly working hours found (40 hours assumed).',
    'Не найдена продолжительность рабочей недели (принято 40 часов).',
  ),
  PROBATION_TOO_LONG: tpl(
    'Sınaq müddəti {months} aydır — qanuni maksimum 6 aydır.',
    'Die Probezeit beträgt {months} Monate — zulässig sind höchstens 6 Monate.',
    'The probation period is {months} months — the legal maximum is 6 months.',
    'Испытательный срок {months} мес. — по закону не более 6 месяцев.',
  ),
  VACATION_TOO_LOW: tpl(
    'Məzuniyyət {days} gündür — həftədə {week} iş günü üçün qanuni minimum {min} gündür.',
    'Der Urlaub beträgt {days} Tage — gesetzlich sind bei einer {week}-Tage-Woche mindestens {min} Tage vorgeschrieben.',
    'Vacation is {days} days — the legal minimum for a {week}-day week is {min} days.',
    'Отпуск {days} дн. — по закону при {week}-дневной неделе не менее {min} дней.',
  ),
  START_IN_PAST: tpl(
    'İşə başlama tarixi ({date}) keçmişdədir — müqavilə yenilənməlidir.',
    'Der Arbeitsbeginn ({date}) liegt in der Vergangenheit — der Vertrag sollte angepasst werden.',
    'The start date ({date}) is in the past — the contract should be updated.',
    'Дата начала работы ({date}) уже прошла — договор нужно обновить.',
  ),
  FIXED_TERM_NO_END: tpl(
    'Müddətli müqavilədir, amma bitmə tarixi göstərilməyib.',
    'Befristeter Vertrag ohne Enddatum.',
    'Fixed-term contract without an end date.',
    'Срочный договор без даты окончания.',
  ),
  NACHWG_MISSING: tpl(
    'Müqavilədə qanunla (Nachweisgesetz) tələb olunan məlumatlar çatışmır: {clauses}.',
    'Im Vertrag fehlen Angaben nach dem Nachweisgesetz: {clauses}.',
    'The contract lacks information required by the Nachweisgesetz: {clauses}.',
    'В договоре не хватает сведений по закону Nachweisgesetz: {clauses}.',
  ),
  EMPLOYEE_NAME_MISMATCH: tpl(
    'Müqavilədəki işçi adı ({value}) profildəki adla ({profile}) uyğun gəlmir.',
    'Der Name des Arbeitnehmers im Vertrag ({value}) passt nicht zum Profil ({profile}).',
    'The employee name in the contract ({value}) does not match the profile ({profile}).',
    'Имя работника в договоре ({value}) не совпадает с профилем ({profile}).',
  ),
  EMPLOYER_MISMATCH: tpl(
    'Müqavilədəki işəgötürən ({value}) müraciətdəki şirkətdən ({company}) fərqlidir.',
    'Der Arbeitgeber im Vertrag ({value}) weicht vom Unternehmen im Antrag ab ({company}).',
    'The employer in the contract ({value}) differs from the company on the case ({company}).',
    'Работодатель в договоре ({value}) отличается от компании в заявке ({company}).',
  ),
  NOT_READABLE: tpl(
    'Müqavilənin mətni oxunmadı.',
    'Der Vertragstext konnte nicht gelesen werden.',
    'The contract text could not be read.',
    'Не удалось прочитать текст договора.',
  ),
};

export type ContractCode = keyof typeof CONTRACT;

/** Nachweisgesetz essentials (§ 2 NachwG) the contract check looks for. */
export const CLAUSES: Record<string, L10n> = {
  parties: { az: 'tərəflərin adı və ünvanı', de: 'Name und Anschrift der Parteien', en: 'names and addresses of the parties', ru: 'имена и адреса сторон' },
  startDate: { az: 'başlama tarixi', de: 'Beginn des Arbeitsverhältnisses', en: 'start date', ru: 'дата начала' },
  placeOfWork: { az: 'iş yeri', de: 'Arbeitsort', en: 'place of work', ru: 'место работы' },
  jobDescription: { az: 'işin təsviri', de: 'Tätigkeitsbeschreibung', en: 'job description', ru: 'описание работы' },
  salaryComposition: { az: 'əmək haqqının tərkibi (əlavələr, mükafatlar)', de: 'Zusammensetzung des Entgelts (Zuschläge, Prämien)', en: 'composition of pay (allowances, bonuses)', ru: 'состав оплаты (надбавки, премии)' },
  paymentDue: { az: 'ödəniş vaxtı və üsulu', de: 'Fälligkeit und Art der Auszahlung', en: 'payment date and method', ru: 'срок и способ выплаты' },
  workingHours: { az: 'iş vaxtı', de: 'vereinbarte Arbeitszeit', en: 'working hours', ru: 'рабочее время' },
  overtime: { az: 'əlavə iş saatları', de: 'Überstunden', en: 'overtime', ru: 'сверхурочные' },
  vacation: { az: 'məzuniyyət', de: 'Urlaubsdauer', en: 'vacation', ru: 'отпуск' },
  noticePeriod: { az: 'xitam qaydası və müddəti', de: 'Kündigungsverfahren und -fristen', en: 'notice procedure and periods', ru: 'порядок и сроки расторжения' },
  collectiveAgreement: { az: 'kollektiv müqaviləyə istinad', de: 'Hinweis auf Tarifverträge / Betriebsvereinbarungen', en: 'reference to collective agreements', ru: 'ссылка на коллективные договоры' },
};

export const listOf = (keys: string[]): L10n => {
  const out = {} as L10n;
  for (const l of LOCALES) out[l] = keys.map((k) => CLAUSES[k]?.[l] ?? k).join(', ');
  return out;
};

/** Renders a template whose params are themselves four-language values. */
export const withL10nParam = (t: (p: P) => L10n, params: P, l10nParams: Record<string, L10n>): L10n => {
  const out = {} as L10n;
  for (const l of LOCALES) out[l] = t({ ...params, ...Object.fromEntries(Object.entries(l10nParams).map(([k, v]) => [k, v[l]])) })[l];
  return out;
};

/** DD.MM.YYYY of an ISO date (YYYY-MM-DD…). */
export const dmy = (iso: string | null | undefined) => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

export const money = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

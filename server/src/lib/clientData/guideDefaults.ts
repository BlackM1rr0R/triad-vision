/**
 * Draft "Necə almalı?" guides for the most common Azerbaijani documents. Shipped as DRAFTS: an admin must
 * check them (Admin → Sənəd bələdçiləri) before they count as verified. Fees and durations are deliberately
 * approximate ("təxminən") — never facts; procedures of ASAN xidmət / e-gov.az and of the German embassy change.
 */

export interface GuideText {
  summary: string;
  where: string;
  duration: string;
  cost: string;
  apostille: string;
  translation: string;
  /** One mistake per line. */
  mistakes: string;
  tips: string;
}

export interface GuideLink {
  label: string;
  url: string;
}

export interface GuideDefault {
  key: string;
  content: Record<'az' | 'de' | 'en' | 'ru', GuideText>;
  links: GuideLink[];
}

const ASAN: GuideLink = { label: 'ASAN xidmət', url: 'https://asan.gov.az' };
const EGOV: GuideLink = { label: 'e-gov.az', url: 'https://www.e-gov.az' };
const EMBASSY: GuideLink = { label: 'Deutsche Botschaft Baku', url: 'https://baku.diplo.de' };

const APO = {
  az: 'Səfirliyin hazırkı tələbinə görə apostil və ya leqalizasiya lazım ola bilər — menecerinizdən soruşun (yoxlanılmalıdır).',
  de: 'Je nach aktueller Vorgabe der Botschaft kann eine Apostille oder Legalisation nötig sein — fragen Sie Ihren Betreuer (bitte prüfen).',
  en: 'Depending on the embassy’s current rules an apostille or legalisation may be needed — ask your case manager (to be verified).',
  ru: 'В зависимости от текущих требований посольства может понадобиться апостиль или легализация — уточните у менеджера (требует проверки).',
};
const TR = {
  az: 'Adətən and içmiş tərcüməçi tərəfindən alman dilinə təsdiqli tərcümə tələb olunur.',
  de: 'In der Regel ist eine beglaubigte Übersetzung ins Deutsche durch einen vereidigten Übersetzer nötig.',
  en: 'Usually a certified German translation by a sworn translator is required.',
  ru: 'Обычно нужен заверенный перевод на немецкий язык присяжным переводчиком.',
};
const NO_TR = { az: 'Tərcümə adətən lazım deyil.', de: 'Eine Übersetzung ist in der Regel nicht nötig.', en: 'A translation is usually not needed.', ru: 'Перевод обычно не нужен.' };
const NO_APO = { az: 'Apostil lazım deyil.', de: 'Keine Apostille nötig.', en: 'No apostille needed.', ru: 'Апостиль не нужен.' };

export const GUIDE_DEFAULTS: GuideDefault[] = [
  {
    key: 'PASSPORT',
    links: [ASAN, EMBASSY],
    content: {
      az: { summary: 'Xarici pasportun bütün səhifələrinin aydın skanı.', where: 'Pasport ASAN xidmət mərkəzlərində verilir. Skanı evdə və ya ASAN-da edə bilərsiniz.', duration: 'Yeni pasport: təxminən 10 iş günü (təcili — daha tez). Yoxlanılmalıdır.', cost: 'Dövlət rüsumu — təxminən; asan.gov.az-da cari məbləği yoxlayın.', apostille: NO_APO.az, translation: NO_TR.az, mistakes: 'Yalnız şəkilli səhifə yüklənir\nKənarlar kəsilib, MRZ (aşağıdakı 2 sətir) görünmür\nPasportun müddəti girişdən sonra 12 aydan az qalır', tips: 'Hər səhifəni ayrıca, işıqlı yerdə, parıltısız çəkin. Pasportun ən azı 12 ay etibarlı olması tövsiyə olunur.' },
      de: { summary: 'Klarer Scan aller Seiten des Reisepasses.', where: 'Reisepässe stellen die ASAN-xidmət-Zentren aus. Scannen können Sie zu Hause oder dort.', duration: 'Neuer Pass: ca. 10 Werktage (Express schneller). Bitte prüfen.', cost: 'Staatsgebühr — ungefähr; aktuellen Betrag auf asan.gov.az prüfen.', apostille: NO_APO.de, translation: NO_TR.de, mistakes: 'Nur die Bildseite hochgeladen\nRänder abgeschnitten, MRZ (die 2 Zeilen unten) unlesbar\nPass nach der Einreise weniger als 12 Monate gültig', tips: 'Jede Seite einzeln, hell und ohne Spiegelung fotografieren. Mindestens 12 Monate Gültigkeit werden empfohlen.' },
      en: { summary: 'Clear scan of all pages of your passport.', where: 'Passports are issued at ASAN xidmət centres. You can scan at home or there.', duration: 'New passport: approx. 10 working days (faster with express). To be verified.', cost: 'State fee — approximate; check the current amount on asan.gov.az.', apostille: NO_APO.en, translation: NO_TR.en, mistakes: 'Only the photo page uploaded\nEdges cut off, MRZ (2 lines at the bottom) unreadable\nPassport valid for less than 12 months after entry', tips: 'Photograph every page separately, in good light, without glare. At least 12 months of validity are recommended.' },
      ru: { summary: 'Чёткий скан всех страниц загранпаспорта.', where: 'Паспорта выдают центры ASAN xidmət. Сканировать можно дома или там.', duration: 'Новый паспорт: примерно 10 рабочих дней (срочно — быстрее). Требует проверки.', cost: 'Госпошлина — примерно; актуальную сумму смотрите на asan.gov.az.', apostille: NO_APO.ru, translation: NO_TR.ru, mistakes: 'Загружена только страница с фото\nОбрезаны края, MRZ (2 строки внизу) не читается\nПаспорт действует менее 12 месяцев после въезда', tips: 'Фотографируйте каждую страницу отдельно, при хорошем свете, без бликов. Рекомендуется срок действия не менее 12 месяцев.' },
    },
  },
  {
    key: 'POLICE_CERT',
    links: [EGOV, ASAN],
    content: {
      az: { summary: 'Məhkumluq haqqında arayış (məhkumluğun olub-olmaması).', where: 'e-gov.az portalında (Daxili İşlər Nazirliyi xidməti) onlayn və ya ASAN xidmət mərkəzində.', duration: 'Onlayn: adətən bir neçə gün; ASAN-da daha tez ola bilər. Yoxlanılmalıdır.', cost: 'Təxminən — rüsum xidmət növündən asılıdır; portalda yoxlayın.', apostille: APO.az, translation: TR.az, mistakes: 'Arayış 6 aydan köhnədir\nYalnız azərbaycan dilində, tərcüməsiz\nAd pasportdakı yazılışdan fərqlidir', tips: 'Arayışı səfirlik görüşünə yaxın alın — səfirlik adətən təzə arayış istəyir.' },
      de: { summary: 'Führungszeugnis (Strafregisterauszug, məhkumluq arayışı).', where: 'Online über e-gov.az (Dienst des Innenministeriums) oder in einem ASAN-xidmət-Zentrum.', duration: 'Online meist einige Tage; bei ASAN evtl. schneller. Bitte prüfen.', cost: 'Ungefähr — die Gebühr hängt von der Dienstart ab; im Portal prüfen.', apostille: APO.de, translation: TR.de, mistakes: 'Zeugnis älter als 6 Monate\nNur auf Aserbaidschanisch, ohne Übersetzung\nName anders geschrieben als im Pass', tips: 'Beantragen Sie es kurz vor dem Botschaftstermin — die Botschaft verlangt meist ein aktuelles Zeugnis.' },
      en: { summary: 'Police clearance certificate (criminal record extract, məhkumluq arayışı).', where: 'Online via e-gov.az (Ministry of Internal Affairs service) or at an ASAN xidmət centre.', duration: 'Online usually a few days; at ASAN possibly faster. To be verified.', cost: 'Approximate — the fee depends on the service type; check on the portal.', apostille: APO.en, translation: TR.en, mistakes: 'Certificate older than 6 months\nOnly in Azerbaijani, not translated\nName spelt differently from the passport', tips: 'Get it close to the embassy appointment — the embassy usually wants a recent one.' },
      ru: { summary: 'Справка о несудимости (məhkumluq arayışı).', where: 'Онлайн через e-gov.az (услуга МВД) или в центре ASAN xidmət.', duration: 'Онлайн обычно несколько дней; в ASAN может быть быстрее. Требует проверки.', cost: 'Примерно — пошлина зависит от вида услуги; уточните на портале.', apostille: APO.ru, translation: TR.ru, mistakes: 'Справка старше 6 месяцев\nТолько на азербайджанском, без перевода\nИмя написано иначе, чем в паспорте', tips: 'Получайте справку ближе к записи в посольство — обычно нужна свежая.' },
    },
  },
  {
    key: 'DIPLOMA',
    links: [EGOV, { label: 'anabin (KMK)', url: 'https://anabin.kmk.org' }],
    content: {
      az: { summary: 'Diplom və qiymət əlavəsi (transkript) — hər ikisi.', where: 'Original sizdədir; dublikat və ya transkript üçün təhsil aldığınız müəssisəyə müraciət edin. Diplomun yoxlanması e-gov.az-da mümkündür.', duration: 'Transkript/dublikat: müəssisədən asılıdır, təxminən 1–4 həftə.', cost: 'Təxminən — müəssisədən asılıdır (yoxlanılmalıdır).', apostille: APO.az, translation: TR.az, mistakes: 'Yalnız diplom, əlavə (fənlər və saatlar) yoxdur\nTərcümədə ad pasportdan fərqli yazılıb\nSkan bulanıq, möhür oxunmur', tips: 'Tanınma (Anerkennung) üçün fənlər və saatlar vacibdir — əlavəni mütləq yükləyin.' },
      de: { summary: 'Diplom und Fächer-/Notenübersicht (Transkript) — beides.', where: 'Das Original haben Sie; Duplikat oder Transkript bei Ihrer Hochschule/Schule beantragen. Echtheitsprüfung über e-gov.az möglich.', duration: 'Transkript/Duplikat: je nach Einrichtung ca. 1–4 Wochen.', cost: 'Ungefähr — je nach Einrichtung (bitte prüfen).', apostille: APO.de, translation: TR.de, mistakes: 'Nur das Diplom, ohne Anlage (Fächer und Stunden)\nName in der Übersetzung anders als im Pass\nScan unscharf, Stempel unleserlich', tips: 'Für die Anerkennung zählen Fächer und Stunden — die Anlage unbedingt mit hochladen.' },
      en: { summary: 'Diploma and transcript (subjects and grades) — both.', where: 'You hold the original; request a duplicate or transcript from your institution. Authenticity can be checked on e-gov.az.', duration: 'Transcript/duplicate: depends on the institution, approx. 1–4 weeks.', cost: 'Approximate — depends on the institution (to be verified).', apostille: APO.en, translation: TR.en, mistakes: 'Only the diploma, no transcript (subjects and hours)\nName in the translation differs from the passport\nBlurry scan, stamp unreadable', tips: 'Recognition depends on subjects and hours — always upload the transcript.' },
      ru: { summary: 'Диплом и приложение с оценками (транскрипт) — оба.', where: 'Оригинал у вас; дубликат или транскрипт — в вашем учебном заведении. Подлинность можно проверить на e-gov.az.', duration: 'Транскрипт/дубликат: зависит от заведения, примерно 1–4 недели.', cost: 'Примерно — зависит от заведения (требует проверки).', apostille: APO.ru, translation: TR.ru, mistakes: 'Только диплом, без приложения (предметы и часы)\nИмя в переводе отличается от паспорта\nСкан размытый, печать не читается', tips: 'Для признания важны предметы и часы — обязательно загрузите приложение.' },
    },
  },
  {
    key: 'BIRTH_CERT',
    links: [ASAN, EGOV],
    content: {
      az: { summary: 'Doğum haqqında şəhadətnamə.', where: 'Təkrar şəhadətnamə: ASAN xidmət və ya Qeydiyyat Şöbəsi (Ədliyyə Nazirliyi).', duration: 'Təxminən bir neçə iş günü (yoxlanılmalıdır).', cost: 'Təxminən — dövlət rüsumu; asan.gov.az-da yoxlayın.', apostille: APO.az, translation: TR.az, mistakes: 'Köhnə sovet nümunəsi oxunmur — yenisini alın\nValideynlərin adları pasportlardakı ilə uyğun deyil', tips: 'Ailə birləşməsi və uşaqlar üçün də lazımdır.' },
      de: { summary: 'Geburtsurkunde.', where: 'Zweitschrift: ASAN xidmət oder Standesamt (Justizministerium).', duration: 'Ca. einige Werktage (bitte prüfen).', cost: 'Ungefähr — Staatsgebühr; auf asan.gov.az prüfen.', apostille: APO.de, translation: TR.de, mistakes: 'Alte sowjetische Urkunde unleserlich — neue beantragen\nNamen der Eltern passen nicht zu deren Pässen', tips: 'Wird auch für Familiennachzug und Kinder benötigt.' },
      en: { summary: 'Birth certificate.', where: 'Duplicate: ASAN xidmət or the civil registry office (Ministry of Justice).', duration: 'Approx. a few working days (to be verified).', cost: 'Approximate — state fee; check on asan.gov.az.', apostille: APO.en, translation: TR.en, mistakes: 'Old Soviet certificate unreadable — get a new one\nParents’ names do not match their passports', tips: 'Also needed for family reunification and children.' },
      ru: { summary: 'Свидетельство о рождении.', where: 'Повторное свидетельство: ASAN xidmət или отдел регистрации (Минюст).', duration: 'Примерно несколько рабочих дней (требует проверки).', cost: 'Примерно — госпошлина; уточните на asan.gov.az.', apostille: APO.ru, translation: TR.ru, mistakes: 'Старое советское свидетельство не читается — получите новое\nИмена родителей не совпадают с их паспортами', tips: 'Нужно также для воссоединения семьи и детей.' },
    },
  },
  {
    key: 'MARRIAGE_CERT',
    links: [ASAN],
    content: {
      az: { summary: 'Nikah haqqında şəhadətnamə (evlisinizsə; boşanıbsınızsa — boşanma şəhadətnaməsi).', where: 'ASAN xidmət və ya Qeydiyyat Şöbəsi.', duration: 'Təxminən bir neçə iş günü (yoxlanılmalıdır).', cost: 'Təxminən — dövlət rüsumu; yoxlayın.', apostille: APO.az, translation: TR.az, mistakes: 'Soyad dəyişib, amma pasport köhnə soyaddadır\nBoşanma sənədi əlavə edilməyib', tips: 'Ailə vəziyyəti anketdəki cavabla uyğun olmalıdır.' },
      de: { summary: 'Heiratsurkunde (falls verheiratet; geschieden — Scheidungsurkunde).', where: 'ASAN xidmət oder Standesamt.', duration: 'Ca. einige Werktage (bitte prüfen).', cost: 'Ungefähr — Staatsgebühr; bitte prüfen.', apostille: APO.de, translation: TR.de, mistakes: 'Name geändert, Pass noch mit altem Namen\nScheidungsurkunde fehlt', tips: 'Muss zur Angabe im Fragebogen „Familienstand“ passen.' },
      en: { summary: 'Marriage certificate (if married; divorced — divorce certificate).', where: 'ASAN xidmət or the civil registry office.', duration: 'Approx. a few working days (to be verified).', cost: 'Approximate — state fee; to be verified.', apostille: APO.en, translation: TR.en, mistakes: 'Surname changed but the passport still shows the old one\nDivorce certificate missing', tips: 'Must match your answer in the “Family status” questionnaire.' },
      ru: { summary: 'Свидетельство о браке (если в браке; при разводе — свидетельство о разводе).', where: 'ASAN xidmət или отдел регистрации.', duration: 'Примерно несколько рабочих дней (требует проверки).', cost: 'Примерно — госпошлина; требует проверки.', apostille: APO.ru, translation: TR.ru, mistakes: 'Фамилия изменилась, а паспорт на старую\nНет свидетельства о разводе', tips: 'Должно совпадать с ответом в анкете «Семейное положение».' },
    },
  },
  {
    key: 'EMPLOYMENT_REF',
    links: [EGOV],
    content: {
      az: { summary: 'Əmək kitabçası və/və ya işəgötürəndən arayış (vəzifə, müddət, vəzifə öhdəlikləri).', where: 'Əmək kitabçası sizdə və ya işəgötürəndədir; elektron əmək müqavilələri haqqında çıxarış e-gov.az-da mövcuddur. Arayışı işəgötürənin kadrlar şöbəsindən alın.', duration: 'Arayış: adətən 1–7 gün. Elektron çıxarış dərhal ola bilər.', cost: 'Adətən pulsuzdur (yoxlanılmalıdır).', apostille: APO.az, translation: TR.az, mistakes: 'Arayışda vəzifə öhdəlikləri yazılmayıb\nMöhür və imza yoxdur\nTarixlər anketdəki iş təcrübəsi ilə uyğun deyil', tips: 'Arayışda tam iş dövrü (başlanğıc–son) və vəzifələr olmalıdır — tanınma üçün vacibdir.' },
      de: { summary: 'Arbeitsbuch (əmək kitabçası) und/oder Arbeitgeberbescheinigung (Position, Zeitraum, Aufgaben).', where: 'Das Arbeitsbuch liegt bei Ihnen oder beim Arbeitgeber; ein Auszug der elektronischen Arbeitsverträge ist über e-gov.az abrufbar. Bescheinigung bei der Personalabteilung anfordern.', duration: 'Bescheinigung: meist 1–7 Tage. Elektronischer Auszug oft sofort.', cost: 'Meist kostenlos (bitte prüfen).', apostille: APO.de, translation: TR.de, mistakes: 'Aufgaben fehlen in der Bescheinigung\nKein Stempel, keine Unterschrift\nDaten passen nicht zur Berufserfahrung im Fragebogen', tips: 'Zeitraum (von–bis) und Aufgaben müssen drinstehen — wichtig für die Anerkennung.' },
      en: { summary: 'Employment record book (əmək kitabçası) and/or employer reference (position, period, duties).', where: 'The record book is with you or your employer; an extract of electronic employment contracts is available on e-gov.az. Ask HR for the reference.', duration: 'Reference: usually 1–7 days. Electronic extract often instantly.', cost: 'Usually free (to be verified).', apostille: APO.en, translation: TR.en, mistakes: 'Duties missing in the reference\nNo stamp, no signature\nDates do not match the work history in the questionnaire', tips: 'The period (from–to) and the duties must be stated — important for recognition.' },
      ru: { summary: 'Трудовая книжка (əmək kitabçası) и/или справка работодателя (должность, период, обязанности).', where: 'Трудовая книжка у вас или у работодателя; выписка электронных трудовых договоров есть на e-gov.az. Справку запросите в отделе кадров.', duration: 'Справка: обычно 1–7 дней. Электронная выписка часто сразу.', cost: 'Обычно бесплатно (требует проверки).', apostille: APO.ru, translation: TR.ru, mistakes: 'В справке нет обязанностей\nНет печати и подписи\nДаты не совпадают с опытом работы в анкете', tips: 'Должны быть указаны период (с–по) и обязанности — важно для признания.' },
    },
  },
  {
    key: 'DRIVING_LICENCE',
    links: [ASAN],
    content: {
      az: { summary: 'Sürücülük vəsiqəsinin hər iki tərəfi (kateqoriyalar görünməlidir).', where: 'Vəsiqə ASAN xidmət / DİN Dövlət Yol Polisi tərəfindən verilir.', duration: 'Dəyişdirmə: təxminən bir neçə gün (yoxlanılmalıdır).', cost: 'Təxminən — dövlət rüsumu; yoxlayın.', apostille: NO_APO.az, translation: 'Almaniyada vəsiqənin dəyişdirilməsi üçün tərcümə lazım ola bilər.', mistakes: 'Yalnız ön tərəf yüklənib\nC/CE kateqoriyalarının tarixləri oxunmur', tips: 'Sürücülər üçün: kateqoriyalar və etibarlılıq tarixləri aydın görünməlidir.' },
      de: { summary: 'Führerschein, Vorder- und Rückseite (Klassen müssen sichtbar sein).', where: 'Ausgestellt über ASAN xidmət / Verkehrspolizei.', duration: 'Umtausch: ca. einige Tage (bitte prüfen).', cost: 'Ungefähr — Staatsgebühr; bitte prüfen.', apostille: NO_APO.de, translation: 'Für die spätere Umschreibung in Deutschland kann eine Übersetzung nötig sein.', mistakes: 'Nur die Vorderseite hochgeladen\nDaten der Klassen C/CE unleserlich', tips: 'Für Fahrer: Klassen und Gültigkeitsdaten müssen gut lesbar sein.' },
      en: { summary: 'Driving licence, front and back (classes must be visible).', where: 'Issued via ASAN xidmət / traffic police.', duration: 'Exchange: approx. a few days (to be verified).', cost: 'Approximate — state fee; to be verified.', apostille: NO_APO.en, translation: 'A translation may be needed later to convert the licence in Germany.', mistakes: 'Only the front uploaded\nDates of classes C/CE unreadable', tips: 'For drivers: classes and validity dates must be clearly readable.' },
      ru: { summary: 'Водительское удостоверение с обеих сторон (категории должны быть видны).', where: 'Выдаётся через ASAN xidmət / дорожную полицию.', duration: 'Замена: примерно несколько дней (требует проверки).', cost: 'Примерно — госпошлина; требует проверки.', apostille: NO_APO.ru, translation: 'Для последующей замены в Германии может понадобиться перевод.', mistakes: 'Загружена только лицевая сторона\nДаты категорий C/CE не читаются', tips: 'Для водителей: категории и сроки должны хорошо читаться.' },
    },
  },
  {
    key: 'MEDICAL_CERT',
    links: [],
    content: {
      az: { summary: 'Tibbi arayış (işəgötürən və ya səfirlik tələb edərsə).', where: 'Dövlət poliklinikası və ya lisenziyalı özəl klinika. Hansı müayinələrin lazım olduğunu menecerinizdən soruşun.', duration: 'Təxminən 1–3 gün (yoxlanılmalıdır).', cost: 'Təxminən — klinikadan asılıdır; yoxlayın.', apostille: 'Adətən lazım deyil (yoxlanılmalıdır).', translation: TR.az, mistakes: 'Həkimin imzası və möhürü yoxdur\nArayış köhnədir\nTələb olunan müayinələr göstərilməyib', tips: 'Sürücülər üçün xüsusi tibbi arayış (görmə, eşitmə) tələb oluna bilər.' },
      de: { summary: 'Ärztliches Attest (falls Arbeitgeber oder Botschaft es verlangen).', where: 'Staatliche Poliklinik oder lizenzierte Privatklinik. Welche Untersuchungen nötig sind, sagt Ihnen Ihr Betreuer.', duration: 'Ca. 1–3 Tage (bitte prüfen).', cost: 'Ungefähr — je nach Klinik; bitte prüfen.', apostille: 'Meist nicht nötig (bitte prüfen).', translation: TR.de, mistakes: 'Keine Unterschrift und kein Stempel des Arztes\nAttest zu alt\nVerlangte Untersuchungen fehlen', tips: 'Für Fahrer kann ein besonderes Attest (Sehen, Hören) verlangt werden.' },
      en: { summary: 'Medical certificate (if the employer or embassy requires one).', where: 'State polyclinic or licensed private clinic. Your case manager tells you which examinations are needed.', duration: 'Approx. 1–3 days (to be verified).', cost: 'Approximate — depends on the clinic; to be verified.', apostille: 'Usually not needed (to be verified).', translation: TR.en, mistakes: 'No doctor’s signature or stamp\nCertificate too old\nRequired examinations missing', tips: 'Drivers may need a special certificate (vision, hearing).' },
      ru: { summary: 'Медицинская справка (если её требует работодатель или посольство).', where: 'Государственная поликлиника или лицензированная частная клиника. Какие обследования нужны, скажет менеджер.', duration: 'Примерно 1–3 дня (требует проверки).', cost: 'Примерно — зависит от клиники; требует проверки.', apostille: 'Обычно не нужен (требует проверки).', translation: TR.ru, mistakes: 'Нет подписи и печати врача\nСправка устарела\nНет нужных обследований', tips: 'Водителям может понадобиться отдельная справка (зрение, слух).' },
    },
  },
  {
    key: 'PHOTO',
    links: [EMBASSY],
    content: {
      az: { summary: 'Biometrik foto 35×45 mm, açıq fon, son 6 ayda çəkilmiş.', where: 'İstənilən foto-salon (biometrik foto deyin).', duration: 'Adətən dərhal.', cost: 'Təxminən — salondan asılıdır.', apostille: NO_APO.az, translation: NO_TR.az, mistakes: 'Telefonla evdə çəkilmiş selfi\nKölgə, eynək parıltısı, gülümsəmə\nFon ağ/açıq boz deyil\nÜz ölçüsü (çənədən başa 32–36 mm) uyğun deyil', tips: 'Səfirliyə həm də kağız fotolar aparılır — menecerin dediyi sayda sifariş edin.' },
      de: { summary: 'Biometrisches Passfoto 35×45 mm, heller Hintergrund, nicht älter als 6 Monate.', where: 'Jedes Fotostudio (biometrisches Foto verlangen).', duration: 'Meist sofort.', cost: 'Ungefähr — je nach Studio.', apostille: NO_APO.de, translation: NO_TR.de, mistakes: 'Selfie zu Hause mit dem Handy\nSchatten, Brillenreflexe, Lächeln\nHintergrund nicht weiß/hellgrau\nGesichtsgröße (Kinn bis Scheitel 32–36 mm) passt nicht', tips: 'Zur Botschaft nehmen Sie auch Papierfotos mit — so viele, wie Ihr Betreuer sagt.' },
      en: { summary: 'Biometric photo 35×45 mm, light background, not older than 6 months.', where: 'Any photo studio (ask for a biometric photo).', duration: 'Usually immediately.', cost: 'Approximate — depends on the studio.', apostille: NO_APO.en, translation: NO_TR.en, mistakes: 'Selfie taken at home with a phone\nShadows, glasses glare, smiling\nBackground not white/light grey\nFace size (chin to crown 32–36 mm) wrong', tips: 'Bring printed photos to the embassy as well — as many as your case manager says.' },
      ru: { summary: 'Биометрическое фото 35×45 мм, светлый фон, не старше 6 месяцев.', where: 'Любое фотоателье (попросите биометрическое фото).', duration: 'Обычно сразу.', cost: 'Примерно — зависит от ателье.', apostille: NO_APO.ru, translation: NO_TR.ru, mistakes: 'Селфи дома на телефон\nТени, блики очков, улыбка\nФон не белый/светло-серый\nРазмер лица (от подбородка до макушки 32–36 мм) не подходит', tips: 'В посольство возьмите и бумажные фото — столько, сколько скажет менеджер.' },
    },
  },
  {
    key: 'LANGUAGE_CERT',
    links: [{ label: 'Goethe-Institut Baku', url: 'https://www.goethe.de/aserbaidschan' }, { label: 'telc', url: 'https://www.telc.net' }],
    content: {
      az: { summary: 'Dil sertifikatı (alman dili: Goethe, telc, ÖSD, TestDaF; tələb olunan səviyyə vizadan asılıdır).', where: 'Bakıda Goethe-İnstitut və ya lisenziyalı imtahan mərkəzləri.', duration: 'İmtahan tarixi bir neçə həftə əvvəl yazılmalıdır; nəticə adətən 2–6 həftəyə.', cost: 'Təxminən — səviyyədən və mərkəzdən asılıdır; mərkəzin saytında yoxlayın.', apostille: NO_APO.az, translation: 'Alman dilində sertifikatlar üçün tərcümə lazım deyil.', mistakes: 'Kursu bitirmə arayışı sertifikat sayılmır\nYalnız bir modul (məs. yalnız yazılı) keçilib\nSertifikat çox köhnədir', tips: 'Bütün modulların (oxu, dinləmə, yazı, danışıq) keçildiyi tam sertifikat yükləyin.' },
      de: { summary: 'Sprachzertifikat (Deutsch: Goethe, telc, ÖSD, TestDaF; das nötige Niveau hängt vom Visum ab).', where: 'Goethe-Institut Baku oder lizenzierte Prüfungszentren.', duration: 'Prüfungstermin einige Wochen vorher buchen; Ergebnis meist nach 2–6 Wochen.', cost: 'Ungefähr — je nach Niveau und Zentrum; auf der Seite des Zentrums prüfen.', apostille: NO_APO.de, translation: 'Für deutschsprachige Zertifikate keine Übersetzung nötig.', mistakes: 'Kursbescheinigung statt Prüfungszertifikat\nNur ein Modul bestanden (z. B. nur schriftlich)\nZertifikat zu alt', tips: 'Laden Sie das vollständige Zertifikat mit allen Modulen (Lesen, Hören, Schreiben, Sprechen) hoch.' },
      en: { summary: 'Language certificate (German: Goethe, telc, ÖSD, TestDaF; the level needed depends on the visa).', where: 'Goethe-Institut Baku or licensed exam centres.', duration: 'Book the exam a few weeks ahead; results usually after 2–6 weeks.', cost: 'Approximate — depends on level and centre; check the centre’s website.', apostille: NO_APO.en, translation: 'No translation needed for German-language certificates.', mistakes: 'Course attendance certificate instead of an exam certificate\nOnly one module passed (e.g. written only)\nCertificate too old', tips: 'Upload the full certificate with all modules (reading, listening, writing, speaking).' },
      ru: { summary: 'Языковой сертификат (немецкий: Goethe, telc, ÖSD, TestDaF; нужный уровень зависит от визы).', where: 'Goethe-Institut в Баку или лицензированные экзаменационные центры.', duration: 'Записывайтесь на экзамен за несколько недель; результат обычно через 2–6 недель.', cost: 'Примерно — зависит от уровня и центра; уточните на сайте центра.', apostille: NO_APO.ru, translation: 'Для сертификатов на немецком перевод не нужен.', mistakes: 'Справка об окончании курса вместо сертификата экзамена\nСдан только один модуль (например, только письменный)\nСертификат слишком старый', tips: 'Загрузите полный сертификат со всеми модулями (чтение, аудирование, письмо, говорение).' },
    },
  },
];

/** Requirement keys that share a guide. */
export const GUIDE_ALIASES: Record<string, string> = { PHOTO_2: 'PHOTO', GERMAN_CERT: 'LANGUAGE_CERT', DIPLOMA_TRANSLATION: 'DIPLOMA', TRANSCRIPT: 'DIPLOMA', EMPLOYMENT_RECORD: 'EMPLOYMENT_REF', POLICE_CERTIFICATE: 'POLICE_CERT' };

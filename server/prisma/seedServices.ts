type L = { az: string; de: string; en: string; ru: string };
type LL = { az: string[]; de: string[]; en: string[]; ru: string[] };

const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=75`;

export const services: {
  slug: string; icon: string; image: string; audience: string; title: L; summary: L; body: L; features: LL;
}[] = [
  {
    slug: 'candidate-selection', icon: 'UserSearch', image: img('1600880292203-757bb62b4baf'), audience: 'company',
    title: { az: 'Namizəd seçimi', de: 'Kandidatenauswahl', en: 'Candidate selection', ru: 'Подбор кандидатов' },
    summary: {
      az: 'Peşə bacarıqları, təcrübə və dil səviyyəsinə görə seçim və müsahibə.',
      de: 'Auswahl und Interviews nach Fachkenntnissen, Erfahrung und Sprachniveau.',
      en: 'Selection and interviews based on skills, experience and language level.',
      ru: 'Отбор и собеседования по навыкам, опыту и уровню языка.',
    },
    body: {
      az: 'Şirkətinizin tələblərini ətraflı öyrənirik: vəzifə, iş şəraiti, növbə qrafiki, maaş və dil tələbləri. Bu profil əsasında Azərbaycandakı namizəd bazamızdan və tərəfdaş peşə məktəblərindən uyğun namizədləri seçirik.\n\nHər namizəd üç mərhələdən keçir: sənədlərin yoxlanılması, praktiki bacarıqların qiymətləndirilməsi və onlayn müsahibə. Sizə yalnız tələblərə tam cavab verən namizədlərin qısa siyahısını təqdim edirik və istəsəniz, onlarla birbaşa video müsahibə təşkil edirik.',
      de: 'Wir analysieren Ihre Anforderungen im Detail: Position, Arbeitsbedingungen, Schichtplan, Gehalt und Sprachniveau. Auf dieser Basis wählen wir passende Kandidaten aus unserem Bewerberpool in Aserbaidschan und aus Partner-Berufsschulen aus.\n\nJeder Kandidat durchläuft drei Stufen: Dokumentenprüfung, praktische Kompetenzbewertung und Online-Interview. Sie erhalten nur eine Shortlist passender Kandidaten und auf Wunsch organisieren wir direkte Video-Interviews.',
      en: 'We study your requirements in detail: position, working conditions, shifts, salary and language level. Based on this profile we select matching candidates from our pool in Azerbaijan and partner vocational schools.\n\nEvery candidate goes through three stages: document check, practical skills assessment and an online interview. You only receive a shortlist of fully matching candidates, and we can arrange direct video interviews on request.',
      ru: 'Мы детально изучаем ваши требования: должность, условия труда, график, зарплату и уровень языка. На основе этого профиля подбираем кандидатов из нашей базы в Азербайджане и партнёрских профшкол.\n\nКаждый кандидат проходит три этапа: проверку документов, оценку практических навыков и онлайн-собеседование. Вы получаете только шорт-лист подходящих кандидатов, а по запросу мы организуем видеособеседования.',
    },
    features: {
      az: ['Vəzifə profilinin hazırlanması', 'Sənəd və təcrübənin yoxlanılması', 'Praktiki bacarıq testi', 'Onlayn və video müsahibə', 'Qısa siyahı (shortlist) 2 həftədə'],
      de: ['Erstellung des Anforderungsprofils', 'Prüfung von Unterlagen und Erfahrung', 'Praktischer Kompetenztest', 'Online- und Video-Interviews', 'Shortlist innerhalb von 2 Wochen'],
      en: ['Job profile definition', 'Document and experience check', 'Practical skills test', 'Online and video interviews', 'Shortlist within 2 weeks'],
      ru: ['Составление профиля вакансии', 'Проверка документов и опыта', 'Практический тест навыков', 'Онлайн- и видеособеседования', 'Шорт-лист за 2 недели'],
    },
  },
  {
    slug: 'documents', icon: 'FileCheck2', image: img('1454165804606-c3d57bc86b40'), audience: 'candidate',
    title: { az: 'Sənədləşmə və tərcümə', de: 'Dokumente & Übersetzung', en: 'Documents & translation', ru: 'Документы и перевод' },
    summary: {
      az: 'Sənədlərin toplanması, tərcüməsi, notarial təsdiqi və yoxlanması.',
      de: 'Zusammenstellung, Übersetzung, Beglaubigung und Prüfung der Unterlagen.',
      en: 'Collecting, translating, certifying and checking your documents.',
      ru: 'Сбор, перевод, нотариальное заверение и проверка документов.',
    },
    body: {
      az: 'Alman orqanları sənədlərin düzgünlüyünə çox ciddi yanaşır. Kiçik bir səhv belə prosesi həftələrlə uzada bilər. Ona görə hər sənədi standartlara uyğun hazırlayırıq: and içmiş tərcüməçilər tərəfindən alman dilinə tərcümə, notarial təsdiq və lazım olduqda apostil.\n\nBütün sənədləriniz onlayn kabinetinizdə saxlanılır. Hansı sənədin qəbul edildiyini, hansının düzəliş tələb etdiyini dərhal görürsünüz.',
      de: 'Deutsche Behörden prüfen Unterlagen sehr genau. Schon ein kleiner Fehler kann das Verfahren um Wochen verzögern. Deshalb bereiten wir jedes Dokument normgerecht vor: beeidigte Übersetzung ins Deutsche, notarielle Beglaubigung und bei Bedarf Apostille.\n\nAlle Ihre Dokumente liegen in Ihrem Kundenbereich. Sie sehen sofort, welches Dokument akzeptiert wurde und welches korrigiert werden muss.',
      en: 'German authorities check documents very strictly. Even a small mistake can delay the process by weeks. So we prepare every document to standard: sworn translation into German, notarisation and an apostille where needed.\n\nAll your documents are kept in your online account. You see immediately which were accepted and which need corrections.',
      ru: 'Немецкие ведомства очень строго проверяют документы. Даже небольшая ошибка может затянуть процесс на недели. Поэтому мы готовим каждый документ по стандарту: присяжный перевод на немецкий, нотариальное заверение и при необходимости апостиль.\n\nВсе ваши документы хранятся в личном кабинете. Вы сразу видите, какие приняты, а какие требуют исправлений.',
    },
    features: {
      az: ['Fərdi sənəd siyahısı', 'And içmiş tərcüməçi ilə tərcümə', 'Notarial təsdiq və apostil', 'Onlayn yükləmə və yoxlama', 'Hər sənəd üzrə status'],
      de: ['Individuelle Dokumentenliste', 'Beeidigte Übersetzung', 'Beglaubigung und Apostille', 'Online-Upload und Prüfung', 'Status für jedes Dokument'],
      en: ['Personal document checklist', 'Sworn translation', 'Notarisation and apostille', 'Online upload and review', 'Status for every document'],
      ru: ['Индивидуальный список документов', 'Присяжный перевод', 'Нотариальное заверение и апостиль', 'Онлайн-загрузка и проверка', 'Статус по каждому документу'],
    },
  },
  {
    slug: 'recognition', icon: 'Award', image: img('1522202176988-66273c2fd55f'), audience: 'candidate',
    title: { az: 'Diplomun tanınması', de: 'Anerkennung', en: 'Qualification recognition', ru: 'Признание диплома' },
    summary: {
      az: 'Anerkennung, ZAB və peşə sertifikatlarının tanınması prosesi.',
      de: 'Anerkennungsverfahren, ZAB und Anerkennung von Berufszertifikaten.',
      en: 'Anerkennung, ZAB and recognition of vocational certificates.',
      ru: 'Anerkennung, ZAB и признание профессиональных сертификатов.',
    },
    body: {
      az: 'Bir çox peşə üçün Almaniyada işləmək şərti diplomun rəsmi tanınmasıdır. Hansı orqana (IHK FOSA, HWK, səhiyyə nazirliyi, ZAB) müraciət ediləcəyini müəyyən edir, ərizəni hazırlayır və prosesi sonadək izləyirik.\n\nQismən tanınma (Defizitbescheid) olduqda, çatışmayan bilikləri Almaniyada tamamlamaq üçün §16d vizası ilə tamamlayıcı təhsil yolunu təşkil edirik.',
      de: 'Für viele Berufe ist die offizielle Anerkennung des Abschlusses Voraussetzung. Wir ermitteln die zuständige Stelle (IHK FOSA, HWK, Gesundheitsbehörde, ZAB), bereiten den Antrag vor und begleiten das Verfahren bis zum Bescheid.\n\nBei teilweiser Anerkennung (Defizitbescheid) organisieren wir den Weg über §16d, um fehlende Kenntnisse in Deutschland auszugleichen.',
      en: 'For many professions, official recognition of your qualification is a requirement. We identify the right authority (IHK FOSA, HWK, health authority, ZAB), prepare the application and follow it through to the decision.\n\nIf recognition is partial (Defizitbescheid), we organise the §16d route so you can close the gaps in Germany.',
      ru: 'Для многих профессий условием работы является официальное признание диплома. Мы определяем нужный орган (IHK FOSA, HWK, органы здравоохранения, ZAB), готовим заявление и сопровождаем процесс до решения.\n\nПри частичном признании (Defizitbescheid) организуем путь через §16d, чтобы восполнить недостающие знания в Германии.',
    },
    features: {
      az: ['anabin bazasında yoxlama', 'Müvafiq orqanın müəyyən edilməsi', 'Ərizənin hazırlanması', 'Qismən tanınmada §16d yolu', 'Prosesin sonadək izlənməsi'],
      de: ['Prüfung in anabin', 'Ermittlung der zuständigen Stelle', 'Antragsvorbereitung', '§16d bei Teilanerkennung', 'Begleitung bis zum Bescheid'],
      en: ['anabin database check', 'Finding the competent authority', 'Application preparation', '§16d route for partial recognition', 'Follow-up to the decision'],
      ru: ['Проверка в базе anabin', 'Определение компетентного органа', 'Подготовка заявления', 'Путь §16d при частичном признании', 'Сопровождение до решения'],
    },
  },
  {
    slug: 'visa-support', icon: 'Stamp', image: img('1560969184-10fe8719e047'), audience: 'all',
    title: { az: 'Viza dəstəyi', de: 'Visumbegleitung', en: 'Visa support', ru: 'Визовая поддержка' },
    summary: {
      az: 'Bundesagentur razılığı, səfirlik görüşü və müraciətin izlənməsi.',
      de: 'Zustimmung der Bundesagentur, Botschaftstermin und Nachverfolgung.',
      en: 'Federal Employment Agency approval, embassy appointment and tracking.',
      ru: 'Согласие Bundesagentur, запись в посольство и отслеживание заявки.',
    },
    body: {
      az: 'Viza prosesinin bütün mərhələlərini koordinasiya edirik: işəgötürənlə birlikdə Bundesagentur für Arbeit-dən ilkin razılıq (Vorabzustimmung), lazım olduqda sürətləndirilmiş prosedur (§81a), səfirlik sənəd paketinin hazırlanması və görüşün təyin edilməsi.\n\nGörüşdən əvvəl namizədi müsahibəyə hazırlayırıq. Müraciət səfirliyə təqdim edildikdən sonra qərara qədər hər dəyişiklik barədə kabinetdə və e-poçtla bildiriş gəlir.',
      de: 'Wir koordinieren alle Phasen: Vorabzustimmung der Bundesagentur für Arbeit gemeinsam mit dem Arbeitgeber, bei Bedarf das beschleunigte Fachkräfteverfahren (§81a), das Antragspaket für die Botschaft und die Terminvereinbarung.\n\nVor dem Termin bereiten wir den Kandidaten auf das Gespräch vor. Nach der Antragstellung erhalten Sie bis zur Entscheidung bei jeder Änderung eine Benachrichtigung im Portal und per E-Mail.',
      en: 'We coordinate every stage: pre-approval from the Federal Employment Agency together with the employer, the fast-track procedure (§81a) where useful, the embassy document package and the appointment.\n\nWe prepare the candidate for the interview. After the application is lodged, you get a portal and email notification for every change until the decision.',
      ru: 'Мы координируем все этапы: предварительное согласие Bundesagentur für Arbeit вместе с работодателем, при необходимости ускоренную процедуру (§81a), пакет документов для посольства и запись на приём.\n\nПеред приёмом готовим кандидата к собеседованию. После подачи заявки до решения вы получаете уведомление в кабинете и по e-mail при каждом изменении.',
    },
    features: {
      az: ['Vorabzustimmung (BA)', 'Sürətləndirilmiş prosedur §81a', 'Səfirlik sənəd paketi', 'Müsahibəyə hazırlıq', 'Qərara qədər izləmə'],
      de: ['Vorabzustimmung der BA', 'Beschleunigtes Verfahren §81a', 'Antragspaket für die Botschaft', 'Vorbereitung auf das Gespräch', 'Nachverfolgung bis zur Entscheidung'],
      en: ['Federal Agency pre-approval', 'Fast-track procedure §81a', 'Embassy document package', 'Interview preparation', 'Tracking until the decision'],
      ru: ['Предварительное согласие BA', 'Ускоренная процедура §81a', 'Пакет документов для посольства', 'Подготовка к собеседованию', 'Отслеживание до решения'],
    },
  },
  {
    slug: 'german-courses', icon: 'Languages', image: img('1556761175-5973dc0f32e7'), audience: 'candidate',
    title: { az: 'Alman dili hazırlığı', de: 'Deutschkurse', en: 'German courses', ru: 'Курсы немецкого' },
    summary: {
      az: 'Tərəfdaş kurslarla A1-dən B2-yə qədər alman dili hazırlığı.',
      de: 'Deutschvorbereitung von A1 bis B2 mit Partnerschulen.',
      en: 'German preparation from A1 to B2 with partner schools.',
      ru: 'Подготовка по немецкому от A1 до B2 с партнёрскими школами.',
    },
    body: {
      az: 'Dil — Almaniyada uğurun açarıdır. Bakıdakı tərəfdaş dil mərkəzlərində və onlayn formatda intensiv kurslar təşkil edirik. Proqram peşəyə yönəlib: sürücülər üçün nəqliyyat terminologiyası, tibb işçiləri üçün tibbi dil.\n\nGoethe, telc və ÖSD imtahanlarına hazırlıq, sınaq imtahanları və imtahan qeydiyyatında kömək edirik.',
      de: 'Sprache ist der Schlüssel zum Erfolg in Deutschland. Wir organisieren Intensivkurse bei Partnerschulen in Baku und online. Das Programm ist berufsbezogen: Verkehrsdeutsch für Fahrer, medizinisches Deutsch für Pflegekräfte.\n\nWir bereiten auf Goethe-, telc- und ÖSD-Prüfungen vor, mit Probeprüfungen und Hilfe bei der Anmeldung.',
      en: 'Language is the key to success in Germany. We organise intensive courses at partner schools in Baku and online. The programme is job-focused: transport vocabulary for drivers, medical German for nurses.\n\nWe prepare for Goethe, telc and ÖSD exams, with mock exams and help with registration.',
      ru: 'Язык — ключ к успеху в Германии. Мы организуем интенсивные курсы в партнёрских школах в Баку и онлайн. Программа ориентирована на профессию: транспортная лексика для водителей, медицинский немецкий для медработников.\n\nГотовим к экзаменам Goethe, telc и ÖSD, проводим пробные экзамены и помогаем с регистрацией.',
    },
    features: {
      az: ['A1–B2 intensiv kurslar', 'Peşəyönümlü proqram', 'Onlayn və əyani format', 'Goethe / telc / ÖSD hazırlığı', 'Sınaq imtahanları'],
      de: ['Intensivkurse A1–B2', 'Berufsbezogenes Programm', 'Online und vor Ort', 'Vorbereitung Goethe / telc / ÖSD', 'Probeprüfungen'],
      en: ['Intensive A1–B2 courses', 'Job-focused programme', 'Online and in person', 'Goethe / telc / ÖSD preparation', 'Mock exams'],
      ru: ['Интенсивные курсы A1–B2', 'Профессиональная программа', 'Онлайн и очно', 'Подготовка Goethe / telc / ÖSD', 'Пробные экзамены'],
    },
  },
  {
    slug: 'arrival-integration', icon: 'Plane', image: img('1599946347371-68eb71b16afc'), audience: 'all',
    title: { az: 'Gəliş və inteqrasiya', de: 'Ankunft & Integration', en: 'Arrival & integration', ru: 'Приезд и интеграция' },
    summary: {
      az: 'Hava limanında qarşılama, yaşayış, Anmeldung, bank və sığorta.',
      de: 'Abholung am Flughafen, Wohnung, Anmeldung, Bank und Versicherung.',
      en: 'Airport pick-up, housing, registration, bank and insurance.',
      ru: 'Встреча в аэропорту, жильё, прописка, банк и страховка.',
    },
    body: {
      az: 'Vizanın alınması yolun sonu deyil. Uçuşun planlaşdırılmasından tutmuş ilk iş gününə qədər yanınızdayıq: hava limanında qarşılama, yaşayış yerinin hazırlanması, ünvan qeydiyyatı (Anmeldung), bank hesabı, vergi nömrəsi və tibbi sığorta.\n\nİlk aylarda həm işçi, həm də işəgötürən üçün əlaqə şəxsimiz olur. Ortaya çıxan suallar tez həll olunur.',
      de: 'Mit dem Visum ist der Weg nicht zu Ende. Von der Flugplanung bis zum ersten Arbeitstag sind wir da: Abholung am Flughafen, Unterkunft, Anmeldung, Bankkonto, Steuer-ID und Krankenversicherung.\n\nIn den ersten Monaten haben Mitarbeiter und Arbeitgeber einen festen Ansprechpartner bei uns, damit Fragen schnell geklärt werden.',
      en: 'Getting the visa is not the end of the road. From flight planning to the first working day we are there: airport pick-up, housing, address registration, bank account, tax ID and health insurance.\n\nIn the first months both employee and employer have a dedicated contact person at Triad Vision, so questions are solved quickly.',
      ru: 'Получение визы — не конец пути. От планирования перелёта до первого рабочего дня мы рядом: встреча в аэропорту, жильё, регистрация по адресу, банковский счёт, налоговый номер и страховка.\n\nВ первые месяцы и у работника, и у работодателя есть контактное лицо в Triad Vision, поэтому вопросы решаются быстро.',
    },
    features: {
      az: ['Uçuşun planlaşdırılması', 'Hava limanında qarşılama', 'Yaşayış yeri', 'Anmeldung, bank, Steuer-ID', 'İlk aylarda əlaqə şəxsi'],
      de: ['Flugplanung', 'Abholung am Flughafen', 'Unterkunft', 'Anmeldung, Bank, Steuer-ID', 'Ansprechpartner in den ersten Monaten'],
      en: ['Flight planning', 'Airport pick-up', 'Housing', 'Registration, bank, tax ID', 'Contact person for the first months'],
      ru: ['Планирование перелёта', 'Встреча в аэропорту', 'Жильё', 'Прописка, банк, Steuer-ID', 'Контактное лицо в первые месяцы'],
    },
  },
  {
    slug: 'employer-services', icon: 'Building2', image: img('1586528116311-ad8dd3c8310d'), audience: 'company',
    title: { az: 'İşəgötürənlər üçün HR dəstəyi', de: 'HR-Service für Arbeitgeber', en: 'HR services for employers', ru: 'HR-поддержка работодателей' },
    summary: {
      az: 'Böyük həcmli işə qəbul, müqavilə və uzunmüddətli işçi saxlanması.',
      de: 'Großvolumige Rekrutierung, Verträge und langfristige Mitarbeiterbindung.',
      en: 'Volume hiring, contracts and long-term retention.',
      ru: 'Массовый подбор, договоры и долгосрочное удержание сотрудников.',
    },
    body: {
      az: 'Bir və ya yüz işçi lazım olsa da, prosesi miqyasına uyğun qururuq. Sizin üçün ayrıca hesab meneceri təyin olunur və bütün namizədlərin vəziyyəti barədə müntəzəm hesabat alırsınız.\n\nİş müqavilələrinin hazırlanması, Bundesagentur üçün iş təsviri (Stellenbeschreibung) və uyğunlaşma proqramı ilə işçilərin uzunmüddətli qalmasına kömək edirik.',
      de: 'Ob ein Mitarbeiter oder hundert – wir skalieren den Prozess passend. Sie erhalten einen festen Account Manager und regelmäßige Reports zum Stand aller Kandidaten.\n\nWir unterstützen bei Arbeitsverträgen, der Stellenbeschreibung für die Bundesagentur und mit einem Onboarding-Programm für eine langfristige Bindung.',
      en: 'Whether you need one worker or a hundred, we scale the process to fit. You get a dedicated account manager and regular reports on every candidate.\n\nWe help with employment contracts, the job description for the Federal Employment Agency and an onboarding programme for long-term retention.',
      ru: 'Нужен один работник или сто — мы масштабируем процесс под вас. Вы получаете персонального менеджера и регулярные отчёты по всем кандидатам.\n\nПомогаем с трудовыми договорами, описанием вакансии для Bundesagentur и программой адаптации для долгосрочного удержания.',
    },
    features: {
      az: ['Ayrıca hesab meneceri', 'Kütləvi işə qəbul', 'Namizədlər üzrə hesabatlar', 'Müqavilə və iş təsviri', 'Uyğunlaşma proqramı'],
      de: ['Fester Account Manager', 'Rekrutierung in großen Stückzahlen', 'Reports zu allen Kandidaten', 'Vertrag und Stellenbeschreibung', 'Onboarding-Programm'],
      en: ['Dedicated account manager', 'Volume recruitment', 'Candidate reports', 'Contract and job description', 'Onboarding programme'],
      ru: ['Персональный менеджер', 'Массовый подбор', 'Отчёты по кандидатам', 'Договор и описание вакансии', 'Программа адаптации'],
    },
  },
  {
    slug: 'ausbildung-placement', icon: 'GraduationCap', image: img('1497366216548-37526070297c'), audience: 'candidate',
    title: { az: 'Ausbildung yerləşdirmə', de: 'Ausbildungsvermittlung', en: 'Ausbildung placement', ru: 'Устройство на Ausbildung' },
    summary: {
      az: 'Maaşlı peşə təhsili üçün uyğun müəssisənin tapılması və viza.',
      de: 'Passenden Ausbildungsbetrieb finden und Visum für die Ausbildung.',
      en: 'Finding the right training company and the visa for it.',
      ru: 'Поиск предприятия для оплачиваемого профобучения и виза.',
    },
    body: {
      az: 'Gənclər üçün Almaniyaya ən etibarlı yollardan biri Ausbildungdur. Maraqlarınıza və dil səviyyənizə uyğun peşə seçir, müəssisələrə müraciət edir və müsahibələrə hazırlayırıq.\n\nMüqavilə imzalandıqdan sonra §16a vizası, yaşayış yeri və Berufsschule qeydiyyatını təşkil edirik.',
      de: 'Für junge Menschen ist die Ausbildung einer der sichersten Wege nach Deutschland. Wir wählen einen Beruf passend zu Interessen und Sprachniveau, bewerben uns bei Betrieben und bereiten auf Vorstellungsgespräche vor.\n\nNach Vertragsunterzeichnung organisieren wir das §16a-Visum, die Unterkunft und die Anmeldung an der Berufsschule.',
      en: 'For young people, Ausbildung is one of the safest routes to Germany. We choose a profession matching your interests and language level, apply to companies and prepare you for interviews.\n\nOnce the contract is signed we organise the §16a visa, housing and vocational school enrolment.',
      ru: 'Для молодёжи Ausbildung — один из самых надёжных путей в Германию. Подбираем профессию по интересам и уровню языка, подаём заявки на предприятия и готовим к собеседованиям.\n\nПосле подписания договора организуем визу §16a, жильё и запись в профшколу.',
    },
    features: {
      az: ['Peşə seçimi üzrə məsləhət', 'Müəssisələrə müraciət', 'Müsahibəyə hazırlıq', '§16a vizası', 'Berufsschule qeydiyyatı'],
      de: ['Berufsberatung', 'Bewerbung bei Betrieben', 'Vorbereitung auf Gespräche', '§16a-Visum', 'Anmeldung an der Berufsschule'],
      en: ['Career guidance', 'Applications to companies', 'Interview preparation', '§16a visa', 'Vocational school enrolment'],
      ru: ['Профориентация', 'Заявки на предприятия', 'Подготовка к собеседованиям', 'Виза §16a', 'Запись в профшколу'],
    },
  },
];

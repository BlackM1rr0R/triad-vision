import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Interview preparation question bank: embassy (visa) interview and job interview with the German
 * employer. Question and tips in four languages, a model answer in simple B1-level German with
 * [placeholders] the client replaces with their own facts. Seeded only into an empty table, so
 * edits made in the admin panel are never overwritten.
 */

type L = { az: string; de: string; en: string; ru: string };
type V = 'WORK' | 'AUSBILDUNG' | 'WEITERBILDUNG' | 'JOB_SEEKER' | 'STUDY' | 'FAMILY' | 'TOURIST';
type Q = { category: string; visaTypes?: V[]; question: L; answerDe: string; tips?: L };

const JOB: V[] = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG'];
const WORKERS: V[] = ['WORK', 'WEITERBILDUNG', 'JOB_SEEKER'];

const EMBASSY: Q[] = [
  {
    category: 'purpose',
    question: { az: 'Almaniyaya niyə getmək istəyirsiniz?', de: 'Warum möchten Sie nach Deutschland reisen?', en: 'Why do you want to go to Germany?', ru: 'Почему вы хотите поехать в Германию?' },
    answerDe: 'Ich möchte nach Deutschland gehen, weil ich dort als [Beruf] bei der Firma [Firma] in [Stadt] arbeiten werde. Ich habe bereits einen Arbeitsvertrag unterschrieben. In Deutschland kann ich meine Erfahrung nutzen und mich beruflich weiterentwickeln.',
    tips: {
      az: 'Qısa və konkret danışın: peşə, şirkət, şəhər. Əzbərlənmiş mətn kimi səslənməsin.',
      de: 'Kurz und konkret antworten: Beruf, Firma, Stadt. Nicht wie auswendig gelernt klingen.',
      en: 'Keep it short and concrete: job, company, city. Do not sound memorised.',
      ru: 'Отвечайте коротко и конкретно: профессия, компания, город. Не звучите заученно.',
    },
  },
  {
    category: 'employer',
    visaTypes: JOB,
    question: { az: 'Hansı şirkətdə işləyəcəksiniz və şirkət nə ilə məşğuldur?', de: 'Bei welcher Firma werden Sie arbeiten und was macht die Firma?', en: 'Which company will you work for and what does it do?', ru: 'В какой компании вы будете работать и чем она занимается?' },
    answerDe: 'Ich werde bei der Firma [Firma] in [Stadt] arbeiten. Die Firma ist im Bereich [Branche, z. B. Logistik] tätig und hat ungefähr [Zahl] Mitarbeiter. Sie [kurze Beschreibung, z. B. transportiert Waren in ganz Europa].',
    tips: {
      az: 'Şirkətin saytını əvvəlcədən oxuyun: sahəsi, ünvanı, təxmini işçi sayı.',
      de: 'Lesen Sie vorher die Webseite der Firma: Branche, Adresse, ungefähre Mitarbeiterzahl.',
      en: 'Read the company website beforehand: industry, address, approximate number of staff.',
      ru: 'Заранее изучите сайт компании: отрасль, адрес, примерное число сотрудников.',
    },
  },
  {
    category: 'employer',
    visaTypes: JOB,
    question: { az: 'Bu işi necə tapdınız?', de: 'Wie haben Sie diese Stelle gefunden?', en: 'How did you find this job?', ru: 'Как вы нашли эту работу?' },
    answerDe: 'Ich habe die Stelle über die Agentur Triad Vision gefunden. Danach hatte ich ein Vorstellungsgespräch mit [Name / Firma] per Video. Nach dem Gespräch habe ich ein Angebot und den Arbeitsvertrag bekommen.',
    tips: {
      az: 'Doğrunu deyin. Agentliklə işləmək tamamilə normaldır.',
      de: 'Sagen Sie die Wahrheit. Die Arbeit mit einer Agentur ist völlig normal.',
      en: 'Tell the truth. Working with an agency is completely normal.',
      ru: 'Говорите правду. Работа через агентство — это совершенно нормально.',
    },
  },
  {
    category: 'contract',
    visaTypes: JOB,
    question: { az: 'Maaşınız nə qədər olacaq?', de: 'Wie hoch ist Ihr Gehalt?', en: 'What will your salary be?', ru: 'Какой будет ваша зарплата?' },
    answerDe: 'Laut Arbeitsvertrag verdiene ich [Betrag] Euro brutto im Monat. Das sind ungefähr [Betrag] Euro netto. Ich arbeite [Zahl] Stunden pro Woche.',
    tips: {
      az: 'Brutto məbləği müqavilədən dəqiq bilin. Netto təxmini deyilə bilər.',
      de: 'Kennen Sie den Bruttobetrag genau aus dem Vertrag. Netto darf ungefähr sein.',
      en: 'Know the gross amount from the contract exactly. Net may be approximate.',
      ru: 'Точно знайте сумму брутто из договора. Нетто можно назвать примерно.',
    },
  },
  {
    category: 'contract',
    visaTypes: JOB,
    question: { az: 'Müqaviləniz nə vaxt başlayır və nə qədər müddətlidir?', de: 'Wann beginnt Ihr Vertrag und wie lange läuft er?', en: 'When does your contract start and how long is it?', ru: 'Когда начинается ваш договор и на какой срок он заключён?' },
    answerDe: 'Mein Vertrag beginnt am [Datum]. Er ist [unbefristet / befristet bis Datum]. Die Probezeit dauert [Zahl] Monate.',
    tips: {
      az: 'Müqavilənin surətini özünüzlə götürün və əsas tarixləri yadda saxlayın.',
      de: 'Nehmen Sie eine Kopie des Vertrags mit und merken Sie sich die wichtigsten Daten.',
      en: 'Bring a copy of the contract and remember the key dates.',
      ru: 'Возьмите копию договора и запомните ключевые даты.',
    },
  },
  {
    category: 'contract',
    visaTypes: JOB,
    question: { az: 'İşdə nə edəcəksiniz? Vəzifə borclarınız nələrdir?', de: 'Was werden Sie bei der Arbeit machen? Was sind Ihre Aufgaben?', en: 'What will you do at work? What are your duties?', ru: 'Что вы будете делать на работе? Каковы ваши обязанности?' },
    answerDe: 'Ich arbeite als [Beruf]. Meine Aufgaben sind zum Beispiel [Aufgabe 1], [Aufgabe 2] und [Aufgabe 3]. Diese Arbeit habe ich auch in [Land] schon [Zahl] Jahre gemacht.',
    tips: {
      az: '2–3 konkret vəzifə adlandırın və təcrübənizlə əlaqələndirin.',
      de: 'Nennen Sie 2–3 konkrete Aufgaben und verbinden Sie sie mit Ihrer Erfahrung.',
      en: 'Name 2–3 concrete duties and link them to your experience.',
      ru: 'Назовите 2–3 конкретные обязанности и свяжите их со своим опытом.',
    },
  },
  {
    category: 'qualification',
    visaTypes: WORKERS,
    question: { az: 'Təhsiliniz və peşə təcrübəniz haqqında danışın.', de: 'Erzählen Sie von Ihrer Ausbildung und Berufserfahrung.', en: 'Tell us about your education and work experience.', ru: 'Расскажите о своём образовании и опыте работы.' },
    answerDe: 'Ich habe [Jahr] meine Ausbildung / mein Studium als [Beruf] in [Stadt] abgeschlossen. Danach habe ich [Zahl] Jahre bei [Firma] gearbeitet. Dort war ich für [Aufgaben] zuständig.',
    tips: {
      az: 'Xronoloji ardıcıllıqla danışın; diplom və iş arayışlarının surətləri yanınızda olsun.',
      de: 'Erzählen Sie in zeitlicher Reihenfolge; haben Sie Kopien von Diplom und Arbeitszeugnissen dabei.',
      en: 'Go in chronological order; carry copies of your diploma and references.',
      ru: 'Рассказывайте в хронологическом порядке; имейте при себе копии диплома и справок с работы.',
    },
  },
  {
    category: 'qualification',
    visaTypes: ['WORK', 'WEITERBILDUNG'],
    question: { az: 'Diplomunuz Almaniyada tanınıbmı (Anerkennung)?', de: 'Ist Ihr Abschluss in Deutschland anerkannt?', en: 'Is your qualification recognised in Germany (Anerkennung)?', ru: 'Признан ли ваш диплом в Германии (Anerkennung)?' },
    answerDe: 'Ja, mein Abschluss wurde von [Stelle, z. B. IHK FOSA / Bezirksregierung] als [gleichwertig / teilweise gleichwertig] anerkannt. Den Bescheid habe ich am [Datum] bekommen. Eine Kopie habe ich dabei.',
    tips: {
      az: 'Tanınma qərarının (Bescheid) surətini götürün. Qismən tanınıbsa, bunu açıq deyin.',
      de: 'Nehmen Sie den Anerkennungsbescheid mit. Bei teilweiser Anerkennung sagen Sie das offen.',
      en: 'Bring the recognition notice (Bescheid). If it is only partial, say so openly.',
      ru: 'Возьмите решение о признании (Bescheid). Если признание частичное, скажите об этом открыто.',
    },
  },
  {
    category: 'language',
    question: { az: 'Alman dilini harada və nə qədər öyrənmisiniz?', de: 'Wo und wie lange haben Sie Deutsch gelernt?', en: 'Where and for how long have you studied German?', ru: 'Где и сколько времени вы изучали немецкий?' },
    answerDe: 'Ich lerne seit [Zahl] Monaten Deutsch. Ich habe einen Kurs bei [Sprachschule] in [Stadt] besucht. Im [Monat, Jahr] habe ich die Prüfung [A2 / B1] bei [Goethe / telc / ÖSD] bestanden. Ich lerne jeden Tag weiter.',
    tips: {
      az: 'Konsul sualı almanca verə bilər — sakit cavab verin, başa düşmədikdə təkrar xahiş edin: „Können Sie das bitte wiederholen?"',
      de: 'Der Konsul kann auf Deutsch fragen — ruhig antworten; bei Unklarheit: „Können Sie das bitte wiederholen?"',
      en: 'The consul may ask in German — answer calmly; if unclear, ask: "Können Sie das bitte wiederholen?"',
      ru: 'Консул может спросить по-немецки — отвечайте спокойно; если не поняли: «Können Sie das bitte wiederholen?»',
    },
  },
  {
    category: 'language',
    question: { az: 'Almaniyada alman dilini öyrənməyə davam edəcəksinizmi?', de: 'Werden Sie in Deutschland weiter Deutsch lernen?', en: 'Will you keep learning German in Germany?', ru: 'Будете ли вы продолжать учить немецкий в Германии?' },
    answerDe: 'Ja, natürlich. Ich möchte nach der Arbeit einen Abendkurs besuchen und das Niveau [B1 / B2] erreichen. Die Sprache ist wichtig für die Arbeit und für das Leben in Deutschland.',
  },
  {
    category: 'accommodation',
    question: { az: 'Almaniyada harada yaşayacaqsınız?', de: 'Wo werden Sie in Deutschland wohnen?', en: 'Where will you live in Germany?', ru: 'Где вы будете жить в Германии?' },
    answerDe: 'Am Anfang wohne ich in einer Wohnung, die mein Arbeitgeber organisiert hat, in [Stadt], [Straße]. Die Miete beträgt [Betrag] Euro im Monat. Später möchte ich selbst eine Wohnung suchen.',
    tips: {
      az: 'Ünvanı və ya mənzil təsdiqini (kirayə müqaviləsi, işəgötürən məktubu) bilin.',
      de: 'Kennen Sie die Adresse oder die Wohnungsbestätigung (Mietvertrag, Schreiben des Arbeitgebers).',
      en: 'Know the address or have the housing confirmation (lease, employer letter).',
      ru: 'Знайте адрес или имейте подтверждение жилья (договор аренды, письмо работодателя).',
    },
  },
  {
    category: 'finances',
    question: { az: 'İlk aylarda xərclərinizi necə qarşılayacaqsınız?', de: 'Wie finanzieren Sie die ersten Monate?', en: 'How will you cover your costs in the first months?', ru: 'Как вы будете покрывать расходы в первые месяцы?' },
    answerDe: 'Ich bekomme ab dem ersten Monat mein Gehalt. Außerdem habe ich [Betrag] Euro gespart, damit ich am Anfang die Miete und andere Kosten bezahlen kann.',
    tips: {
      az: 'Bank arayışı və ya bloklanmış hesab (Sperrkonto) varsa, sənədi göstərin.',
      de: 'Wenn Sie einen Kontoauszug oder ein Sperrkonto haben, zeigen Sie den Nachweis.',
      en: 'If you have a bank statement or blocked account (Sperrkonto), show the proof.',
      ru: 'Если есть выписка из банка или блокированный счёт (Sperrkonto), покажите документ.',
    },
  },
  {
    category: 'family',
    question: { az: 'Ailəniz haqqında danışın. Onlar sizinlə gedəcəklərmi?', de: 'Erzählen Sie von Ihrer Familie. Kommt sie mit?', en: 'Tell us about your family. Will they come with you?', ru: 'Расскажите о своей семье. Поедет ли она с вами?' },
    answerDe: 'Ich bin [verheiratet / ledig] und habe [Zahl] Kinder. Meine Familie bleibt zuerst in [Land]. Wenn ich eine größere Wohnung habe, möchte ich später einen Antrag auf Familiennachzug stellen.',
    tips: {
      az: 'Səmimi olun; anketdə yazdıqlarınızla eyni cavab verin.',
      de: 'Seien Sie ehrlich; antworten Sie genauso wie im Antragsformular.',
      en: 'Be honest; answer the same way as in your application form.',
      ru: 'Будьте честны; отвечайте так же, как в анкете.',
    },
  },
  {
    category: 'plans',
    question: { az: 'Almaniyada nə qədər qalmağı planlaşdırırsınız? Gələcək planlarınız nədir?', de: 'Wie lange möchten Sie in Deutschland bleiben? Was sind Ihre Pläne?', en: 'How long do you plan to stay in Germany? What are your plans?', ru: 'Как долго вы планируете оставаться в Германии? Какие у вас планы?' },
    answerDe: 'Ich möchte langfristig in Deutschland arbeiten. Zuerst möchte ich mich gut einarbeiten und mein Deutsch verbessern. In ein paar Jahren möchte ich [Ziel, z. B. Meister werden / mehr Verantwortung übernehmen].',
  },
  {
    category: 'travel',
    question: { az: 'Əvvəllər Almaniyada və ya Şengen ölkələrində olmusunuzmu?', de: 'Waren Sie schon einmal in Deutschland oder im Schengen-Raum?', en: 'Have you been to Germany or the Schengen area before?', ru: 'Вы бывали раньше в Германии или в Шенгенской зоне?' },
    answerDe: 'Ja, ich war im [Jahr] für [Zahl] Tage in [Land / Stadt] als Tourist. Ich bin pünktlich zurückgereist. / Nein, ich war noch nie in Deutschland. Das ist meine erste Reise.',
    tips: {
      az: 'Köhnə pasportdakı vizalar barədə dəqiq danışın — konsul bunları görür.',
      de: 'Sprechen Sie genau über frühere Visa im alten Pass — der Konsul sieht sie.',
      en: 'Be precise about earlier visas in your old passport — the consul can see them.',
      ru: 'Точно рассказывайте о прежних визах в старом паспорте — консул их видит.',
    },
  },
  {
    category: 'travel',
    question: { az: 'Almaniyada tanışlarınız və ya qohumlarınız varmı?', de: 'Haben Sie Verwandte oder Bekannte in Deutschland?', en: 'Do you have relatives or friends in Germany?', ru: 'Есть ли у вас родственники или знакомые в Германии?' },
    answerDe: 'Ja, mein [Cousin / Freund] wohnt in [Stadt]. Er arbeitet dort als [Beruf]. / Nein, in Deutschland kenne ich noch niemanden, aber meine Kollegen helfen mir am Anfang.',
  },
  {
    category: 'ausbildung',
    visaTypes: ['AUSBILDUNG'],
    question: { az: 'Niyə məhz bu peşə təhsilini (Ausbildung) seçdiniz?', de: 'Warum haben Sie genau diese Ausbildung gewählt?', en: 'Why did you choose this particular apprenticeship (Ausbildung)?', ru: 'Почему вы выбрали именно эту профессиональную подготовку (Ausbildung)?' },
    answerDe: 'Ich interessiere mich schon lange für den Beruf [Beruf]. In [Land] habe ich schon [Praktikum / Erfahrung] gemacht. Die duale Ausbildung in Deutschland ist sehr gut, weil ich in der Schule lerne und gleichzeitig im Betrieb arbeite.',
    tips: {
      az: 'Peşəyə marağınızı konkret nümunə ilə göstərin.',
      de: 'Zeigen Sie Ihr Interesse am Beruf mit einem konkreten Beispiel.',
      en: 'Show your interest in the job with a concrete example.',
      ru: 'Покажите интерес к профессии на конкретном примере.',
    },
  },
  {
    category: 'ausbildung',
    visaTypes: ['AUSBILDUNG'],
    question: { az: 'Təhsil nə qədər davam edir və nə qədər əmək haqqı alacaqsınız?', de: 'Wie lange dauert die Ausbildung und wie viel verdienen Sie?', en: 'How long is the apprenticeship and how much will you earn?', ru: 'Сколько длится обучение и сколько вы будете получать?' },
    answerDe: 'Die Ausbildung dauert [drei] Jahre. Im ersten Jahr bekomme ich [Betrag] Euro brutto im Monat, später mehr. Die Berufsschule ist in [Stadt], der Betrieb ist [Firma].',
  },
  {
    category: 'study',
    visaTypes: ['STUDY'],
    question: { az: 'Hansı universitetdə və hansı ixtisas üzrə oxuyacaqsınız?', de: 'An welcher Hochschule und was werden Sie studieren?', en: 'Which university will you attend and what will you study?', ru: 'В каком вузе и по какой специальности вы будете учиться?' },
    answerDe: 'Ich habe eine Zulassung der [Universität] in [Stadt] für den Studiengang [Fach] bekommen. Das Studium beginnt im [Wintersemester / Sommersemester] und dauert [Zahl] Semester.',
    tips: {
      az: 'Qəbul məktubunu (Zulassungsbescheid) və Sperrkonto təsdiqini yanınızda saxlayın.',
      de: 'Haben Sie den Zulassungsbescheid und den Sperrkonto-Nachweis dabei.',
      en: 'Carry your admission letter (Zulassungsbescheid) and blocked-account proof.',
      ru: 'Имейте при себе письмо о зачислении (Zulassungsbescheid) и подтверждение Sperrkonto.',
    },
  },
  {
    category: 'study',
    visaTypes: ['STUDY'],
    question: { az: 'Niyə təhsil üçün Almaniyanı seçdiniz və təhsildən sonra nə edəcəksiniz?', de: 'Warum studieren Sie in Deutschland und was machen Sie nach dem Studium?', en: 'Why study in Germany and what will you do after graduating?', ru: 'Почему вы выбрали учёбу в Германии и что будете делать после неё?' },
    answerDe: 'Deutsche Hochschulen haben einen sehr guten Ruf, besonders im Bereich [Fach]. Das Studium ist praxisnah. Nach dem Studium möchte ich Berufserfahrung in [Bereich] sammeln.',
  },
  {
    category: 'family_reunion',
    visaTypes: ['FAMILY'],
    question: { az: 'Həyat yoldaşınızla necə tanış olmusunuz və nə vaxt evlənmisiniz?', de: 'Wie haben Sie Ihren Ehepartner kennengelernt und wann haben Sie geheiratet?', en: 'How did you meet your spouse and when did you marry?', ru: 'Как вы познакомились с супругом(ой) и когда поженились?' },
    answerDe: 'Wir haben uns im [Jahr] in [Stadt] kennengelernt, bei [Anlass]. Wir haben am [Datum] in [Stadt] geheiratet. Mein Mann / Meine Frau arbeitet seit [Jahr] in [Stadt] in Deutschland.',
    tips: {
      az: 'Cavablar həyat yoldaşınızın cavabları ilə üst-üstə düşməlidir — tarixləri birlikdə yoxlayın.',
      de: 'Die Antworten müssen zu denen Ihres Partners passen — prüfen Sie die Daten gemeinsam.',
      en: 'Your answers must match your spouse’s — check the dates together.',
      ru: 'Ответы должны совпадать с ответами супруга(и) — сверьте даты вместе.',
    },
  },
  {
    category: 'family_reunion',
    visaTypes: ['FAMILY'],
    question: { az: 'Həyat yoldaşınız Almaniyada harada işləyir və harada yaşayırsınız?', de: 'Wo arbeitet Ihr Ehepartner in Deutschland und wo werden Sie wohnen?', en: 'Where does your spouse work in Germany and where will you live?', ru: 'Где работает ваш супруг(а) в Германии и где вы будете жить?' },
    answerDe: 'Mein Mann / Meine Frau arbeitet als [Beruf] bei [Firma] in [Stadt]. Wir wohnen zusammen in seiner / ihrer Wohnung in der [Straße]. Die Wohnung hat [Zahl] Zimmer und [Zahl] Quadratmeter.',
  },
];

const EMPLOYER: Q[] = [
  {
    category: 'personal',
    question: { az: 'Özünüzü təqdim edin.', de: 'Stellen Sie sich bitte kurz vor.', en: 'Please introduce yourself.', ru: 'Расскажите, пожалуйста, коротко о себе.' },
    answerDe: 'Guten Tag, mein Name ist [Ihr Name]. Ich bin [Alter] Jahre alt und komme aus [Stadt, Land]. Ich bin [Beruf] und habe [Zahl] Jahre Berufserfahrung. In meiner Freizeit [Hobby].',
    tips: {
      az: '1 dəqiqədən çox danışmayın: ad, peşə, təcrübə, niyə bu iş.',
      de: 'Nicht länger als 1 Minute: Name, Beruf, Erfahrung, warum diese Stelle.',
      en: 'No longer than 1 minute: name, job, experience, why this position.',
      ru: 'Не дольше 1 минуты: имя, профессия, опыт, почему эта работа.',
    },
  },
  {
    category: 'experience',
    question: { az: 'Son iş yerinizdə nə edirdiniz?', de: 'Was haben Sie bei Ihrer letzten Arbeitsstelle gemacht?', en: 'What did you do at your last job?', ru: 'Чем вы занимались на последнем месте работы?' },
    answerDe: 'Zuletzt habe ich bei [Firma] als [Beruf] gearbeitet. Ich war für [Aufgaben] verantwortlich. Besonders gut war ich bei [Beispiel].',
  },
  {
    category: 'experience',
    question: { az: 'İşdə çətin bir vəziyyəti və onu necə həll etdiyinizi danışın.', de: 'Erzählen Sie von einer schwierigen Situation bei der Arbeit und wie Sie sie gelöst haben.', en: 'Describe a difficult situation at work and how you solved it.', ru: 'Расскажите о сложной ситуации на работе и как вы её решили.' },
    answerDe: 'Einmal [Situation, z. B. ist eine Maschine kaputt gegangen]. Ich bin ruhig geblieben und habe sofort [Handlung]. Danach habe ich meinen Chef informiert. Am Ende [Ergebnis].',
    tips: {
      az: 'Sxem: vəziyyət → nə etdiniz → nəticə.',
      de: 'Schema: Situation → was Sie gemacht haben → Ergebnis.',
      en: 'Structure: situation → what you did → result.',
      ru: 'Схема: ситуация → что вы сделали → результат.',
    },
  },
  {
    category: 'motivation',
    question: { az: 'Niyə Almaniyada işləmək istəyirsiniz?', de: 'Warum möchten Sie in Deutschland arbeiten?', en: 'Why do you want to work in Germany?', ru: 'Почему вы хотите работать в Германии?' },
    answerDe: 'In Deutschland gibt es gute Arbeitsbedingungen und viele Möglichkeiten, sich weiterzuentwickeln. Ich schätze Ordnung, Pünktlichkeit und Qualität. Außerdem möchte ich meine Deutschkenntnisse verbessern.',
  },
  {
    category: 'motivation',
    visaTypes: JOB,
    question: { az: 'Niyə məhz bizim şirkətdə işləmək istəyirsiniz?', de: 'Warum möchten Sie gerade bei uns arbeiten?', en: 'Why do you want to work for our company in particular?', ru: 'Почему вы хотите работать именно в нашей компании?' },
    answerDe: 'Ihre Firma ist bekannt für [z. B. moderne Fahrzeuge / gute Ausbildung]. Mir gefällt, dass Sie [konkreter Punkt aus der Webseite]. Ich glaube, meine Erfahrung als [Beruf] passt sehr gut zu dieser Stelle.',
    tips: {
      az: 'Şirkət haqqında saytdan bir konkret fakt deyin — bu, maraq göstərir.',
      de: 'Nennen Sie eine konkrete Information von der Webseite — das zeigt Interesse.',
      en: 'Mention one concrete fact from their website — it shows interest.',
      ru: 'Назовите один конкретный факт с сайта компании — это показывает интерес.',
    },
  },
  {
    category: 'strengths',
    question: { az: 'Güclü tərəfləriniz hansılardır?', de: 'Was sind Ihre Stärken?', en: 'What are your strengths?', ru: 'Каковы ваши сильные стороны?' },
    answerDe: 'Ich bin zuverlässig und pünktlich. Ich arbeite sorgfältig und lerne schnell. Zum Beispiel habe ich bei [Firma] in kurzer Zeit [Beispiel] gelernt.',
    tips: {
      az: 'Hər güclü tərəf üçün kiçik bir nümunə verin.',
      de: 'Geben Sie zu jeder Stärke ein kleines Beispiel.',
      en: 'Give a small example for each strength.',
      ru: 'Подкрепите каждую сильную сторону небольшим примером.',
    },
  },
  {
    category: 'strengths',
    question: { az: 'Zəif tərəfləriniz hansılardır?', de: 'Was sind Ihre Schwächen?', en: 'What are your weaknesses?', ru: 'Каковы ваши слабые стороны?' },
    answerDe: 'Mein Deutsch ist noch nicht perfekt. Aber ich lerne jeden Tag und besuche einen Kurs. Manchmal bin ich zu ungeduldig, aber ich arbeite daran.',
    tips: {
      az: 'Həqiqi, amma kritik olmayan zəiflik deyin və onun üzərində necə işlədiyinizi göstərin.',
      de: 'Nennen Sie eine echte, aber nicht kritische Schwäche und wie Sie daran arbeiten.',
      en: 'Name a real but non-critical weakness and how you work on it.',
      ru: 'Назовите реальную, но некритичную слабость и как вы над ней работаете.',
    },
  },
  {
    category: 'work',
    visaTypes: JOB,
    question: { az: 'Növbəli işləməyə, gecə və həftəsonu işləməyə hazırsınızmı?', de: 'Sind Sie bereit, im Schichtdienst, nachts oder am Wochenende zu arbeiten?', en: 'Are you ready to work shifts, nights or weekends?', ru: 'Готовы ли вы работать посменно, ночью или в выходные?' },
    answerDe: 'Ja, das ist für mich kein Problem. In [Land] habe ich auch schon im Schichtdienst gearbeitet. Ich bin flexibel.',
  },
  {
    category: 'driving',
    visaTypes: ['WORK'],
    question: { az: 'Hansı kateqoriyalı sürücülük vəsiqəniz var? Kod 95 varmı?', de: 'Welche Führerscheinklassen haben Sie? Haben Sie die Schlüsselzahl 95?', en: 'Which licence categories do you have? Do you have Code 95?', ru: 'Какие у вас категории прав? Есть ли код 95?' },
    answerDe: 'Ich habe den Führerschein der Klassen [B, C, CE] seit [Jahr]. Die Berufskraftfahrerqualifikation, also die Schlüsselzahl 95, habe ich [schon / mache ich gerade in Deutschland]. Ich habe auch eine Fahrerkarte.',
    tips: {
      az: 'Sürücülər üçün: vəsiqənin dəyişdirilməsi (Umschreibung) prosesini də bildiyinizi göstərin.',
      de: 'Für Fahrer: Zeigen Sie, dass Sie den Ablauf der Führerscheinumschreibung kennen.',
      en: 'For drivers: show you know how the licence conversion (Umschreibung) works.',
      ru: 'Для водителей: покажите, что знаете порядок замены прав (Umschreibung).',
    },
  },
  {
    category: 'driving',
    visaTypes: ['WORK'],
    question: { az: 'Hansı yük maşınları ilə və hansı marşrutlarda işləmisiniz?', de: 'Mit welchen Lkw und auf welchen Strecken sind Sie gefahren?', en: 'Which trucks have you driven and on which routes?', ru: 'На каких грузовиках и по каким маршрутам вы ездили?' },
    answerDe: 'Ich bin [Zahl] Jahre mit [Marke, z. B. Mercedes Actros / Volvo FH] gefahren, meistens mit Planenauflieger. Ich bin im Fernverkehr nach [Länder] gefahren. Ich kenne die Lenk- und Ruhezeiten gut.',
  },
  {
    category: 'safety',
    question: { az: 'İş təhlükəsizliyi sizin üçün nə deməkdir?', de: 'Was bedeutet Arbeitssicherheit für Sie?', en: 'What does work safety mean to you?', ru: 'Что для вас значит безопасность труда?' },
    answerDe: 'Arbeitssicherheit ist sehr wichtig. Ich trage immer meine Schutzkleidung, zum Beispiel Sicherheitsschuhe und Warnweste. Wenn ich ein Problem sehe, sage ich es sofort meinem Vorgesetzten.',
  },
  {
    category: 'teamwork',
    question: { az: 'Komandada işləməyi bacarırsınızmı? Həmkarla mübahisə olsa nə edərsiniz?', de: 'Arbeiten Sie gern im Team? Was machen Sie bei einem Konflikt mit einem Kollegen?', en: 'Do you like teamwork? What do you do in a conflict with a colleague?', ru: 'Любите ли вы работать в команде? Что вы делаете при конфликте с коллегой?' },
    answerDe: 'Ja, ich arbeite gern im Team. Wenn es ein Problem gibt, spreche ich ruhig und direkt mit dem Kollegen. Wenn wir keine Lösung finden, frage ich den Teamleiter.',
  },
  {
    category: 'teamwork',
    question: { az: 'Alman dilini nə dərəcədə bilirsiniz? İşdə təlimatları başa düşəcəksinizmi?', de: 'Wie gut sprechen Sie Deutsch? Verstehen Sie Anweisungen bei der Arbeit?', en: 'How good is your German? Will you understand instructions at work?', ru: 'Насколько хорошо вы говорите по-немецки? Поймёте ли вы указания на работе?' },
    answerDe: 'Ich habe das Niveau [A2 / B1]. Einfache Anweisungen verstehe ich gut. Wenn ich etwas nicht verstehe, frage ich nach. Ich lerne weiter, um bald besser zu sprechen.',
  },
  {
    category: 'salary',
    question: { az: 'Maaş gözləntiləriniz nədir?', de: 'Was sind Ihre Gehaltsvorstellungen?', en: 'What are your salary expectations?', ru: 'Каковы ваши ожидания по зарплате?' },
    answerDe: 'Ich habe mich informiert. Für diese Stelle in [Stadt] liegt das Gehalt ungefähr bei [Betrag] Euro brutto im Monat. Das finde ich fair. Mir ist auch wichtig, dass ich mich weiterentwickeln kann.',
    tips: {
      az: 'Brutto aylıq diapazon deyin; bazar səviyyəsini əvvəlcədən yoxlayın.',
      de: 'Nennen Sie eine monatliche Brutto-Spanne; prüfen Sie vorher das Marktniveau.',
      en: 'Give a monthly gross range; check the market level beforehand.',
      ru: 'Назовите месячный диапазон брутто; заранее узнайте рыночный уровень.',
    },
  },
  {
    category: 'start',
    question: { az: 'Nə vaxt işə başlaya bilərsiniz?', de: 'Wann können Sie anfangen?', en: 'When can you start?', ru: 'Когда вы можете приступить к работе?' },
    answerDe: 'Sobald ich das Visum habe, kann ich anfangen. Das dauert voraussichtlich [Zahl] Wochen. Meine jetzige Stelle kann ich mit [Zahl] Wochen Frist kündigen.',
  },
  {
    category: 'start',
    question: { az: 'Başqa şəhərə köçməyə hazırsınızmı?', de: 'Sind Sie bereit, in eine andere Stadt umzuziehen?', en: 'Are you willing to relocate to another city?', ru: 'Готовы ли вы переехать в другой город?' },
    answerDe: 'Ja, ich bin flexibel. Für mich ist wichtig, dass ich eine gute Arbeit habe. Ich freue mich, [Stadt] kennenzulernen.',
  },
  {
    category: 'personal',
    question: { az: '5 ildən sonra özünüzü harada görürsünüz?', de: 'Wo sehen Sie sich in fünf Jahren?', en: 'Where do you see yourself in five years?', ru: 'Где вы видите себя через пять лет?' },
    answerDe: 'In fünf Jahren möchte ich gut Deutsch sprechen und in Ihrer Firma mehr Verantwortung haben, zum Beispiel als [Position]. Ich möchte langfristig in Deutschland bleiben.',
  },
  {
    category: 'personal',
    question: { az: 'Boş vaxtınızda nə ilə məşğul olursunuz?', de: 'Was machen Sie in Ihrer Freizeit?', en: 'What do you do in your free time?', ru: 'Чем вы занимаетесь в свободное время?' },
    answerDe: 'In meiner Freizeit [mache ich Sport / spiele ich Fußball / koche ich gern]. Ich verbringe gern Zeit mit meiner Familie. Zurzeit lerne ich auch viel Deutsch.',
  },
  {
    category: 'questions',
    question: { az: 'Bizə sualınız varmı?', de: 'Haben Sie noch Fragen an uns?', en: 'Do you have any questions for us?', ru: 'Есть ли у вас вопросы к нам?' },
    answerDe: 'Ja, gern. Wie sieht ein normaler Arbeitstag aus? Gibt es eine Einarbeitung? Und hilft die Firma bei der Wohnungssuche?',
    tips: {
      az: 'Həmişə 2–3 sual hazırlayın. „Sualım yoxdur" demək maraqsızlıq kimi görünə bilər.',
      de: 'Bereiten Sie immer 2–3 Fragen vor. „Keine Fragen" wirkt oft desinteressiert.',
      en: 'Always prepare 2–3 questions. "No questions" can look uninterested.',
      ru: 'Всегда готовьте 2–3 вопроса. «Вопросов нет» может выглядеть как отсутствие интереса.',
    },
  },
  {
    category: 'questions',
    question: { az: 'Niyə sizi işə götürməliyik?', de: 'Warum sollten wir Sie einstellen?', en: 'Why should we hire you?', ru: 'Почему мы должны взять вас на работу?' },
    answerDe: 'Ich habe [Zahl] Jahre Erfahrung als [Beruf], ich bin zuverlässig und motiviert. Ich möchte langfristig bei Ihnen bleiben und lerne aktiv Deutsch. Ich bin sicher, dass ich schnell ein gutes Mitglied in Ihrem Team werde.',
  },
];

const rows = (kind: 'EMBASSY' | 'EMPLOYER', list: Q[]): Prisma.InterviewPrepQuestionCreateManyInput[] =>
  list.map((q, i) => ({
    kind,
    category: q.category,
    question: q.question,
    answerDe: q.answerDe,
    tips: q.tips ?? undefined,
    visaTypes: q.visaTypes ?? undefined,
    sortOrder: i,
    published: true,
  }));

export const INTERVIEW_PREP_SEED_COUNT = EMBASSY.length + EMPLOYER.length;

/** Inserts the question bank when the table is empty; returns how many rows were created. */
export const seedInterviewPrep = async (prisma: PrismaClient) => {
  if ((await prisma.interviewPrepQuestion.count()) > 0) return 0;
  const { count } = await prisma.interviewPrepQuestion.createMany({ data: [...rows('EMBASSY', EMBASSY), ...rows('EMPLOYER', EMPLOYER)] });
  return count;
};

/**
 * Idempotent content enrichment for visa categories and services.
 *
 * Sets the structured visa-page fields (German level, indicative salary and
 * processing ranges, family reunion, requirements, documents, FAQ) and the
 * service-specific steps and duration. Records are matched by slug; missing
 * slugs are skipped with a warning. Safe to run any number of times.
 *
 * Run from server/:  npx tsx prisma/enrich-content.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type L10n = { az: string; de: string; en: string; ru: string };
type L10nList = { az: string[]; de: string[]; en: string[]; ru: string[] };
type Faq = { q: L10n; a: L10n };

type VisaEnrichment = {
  slug: string;
  germanLevel: string;
  salaryMin: number;
  salaryMax: number;
  processingMin: number;
  processingMax: number;
  familyReunion: boolean | null;
  requirements: L10nList;
  documents: L10nList;
  faq: Faq[];
};

type ServiceEnrichment = {
  slug: string;
  steps: L10nList;
  duration: L10n;
};

// ---------------------------------------------------------------------------
// Shared FAQ entries (reused across several visa categories)
// ---------------------------------------------------------------------------

const faqSalary: Faq = {
  q: {
    az: 'Maaş zəmanətlidirmi?',
    de: 'Ist das Gehalt garantiert?',
    en: 'Is the salary guaranteed?',
    ru: 'Гарантирована ли зарплата?',
  },
  a: {
    az: 'Xeyr. Göstərilən rəqəmlər təxmini aylıq brüt maaş aralığıdır. Faktiki maaş işəgötürəndən, regiondan, təcrübənizdən və tətbiq olunan kollektiv müqavilədən asılıdır və əmək müqaviləsində təsbit edilir. Qanuni minimum əmək haqqı Almaniyada bütün işçilərə şamil olunur.',
    de: 'Nein. Die angegebenen Werte sind unverbindliche Bruttomonatsspannen. Das tatsächliche Gehalt hängt vom Arbeitgeber, der Region, Ihrer Erfahrung und einem eventuell geltenden Tarifvertrag ab und wird im Arbeitsvertrag festgelegt. Der gesetzliche Mindestlohn gilt für alle Beschäftigten in Deutschland.',
    en: 'No. The figures shown are indicative gross monthly ranges. The actual salary depends on the employer, the region, your experience and any applicable collective agreement, and is fixed in your employment contract. The statutory minimum wage applies to every employee in Germany.',
    ru: 'Нет. Указанные суммы — ориентировочные диапазоны брутто в месяц. Фактическая зарплата зависит от работодателя, региона, вашего опыта и применимого тарифного соглашения и фиксируется в трудовом договоре. Установленная законом минимальная оплата труда действует для всех работников в Германии.',
  },
};

const faqFamily: Faq = {
  q: {
    az: 'Ailəmi Almaniyaya gətirə bilərəmmi?',
    de: 'Kann ich meine Familie nachholen?',
    en: 'Can I bring my family?',
    ru: 'Могу ли я перевезти семью?',
  },
  a: {
    az: 'Bir qayda olaraq, bəli. Kifayət qədər gəliriniz və uyğun mənziliniz olduqda həyat yoldaşınız və azyaşlı uşaqlarınız ailənin birləşdirilməsi çərçivəsində yanınıza gələ bilər; digər şərtlər fərdi vəziyyətdən asılıdır. Bir çox ailə əsas ərizəçi Almaniyada yerləşdikdən sonra müraciət edir.',
    de: 'In der Regel ja. Ehepartner und minderjährige Kinder können im Rahmen des Familiennachzugs nachkommen, wenn ausreichendes Einkommen und angemessener Wohnraum vorhanden sind; weitere Voraussetzungen hängen vom Einzelfall ab. Viele Familien stellen den Antrag, nachdem sich die Hauptperson in Deutschland eingelebt hat.',
    en: 'Generally yes. Your spouse and minor children can usually join you through family reunification if you have sufficient income and adequate housing; further requirements depend on the individual case. Many families apply once the main applicant has settled in Germany.',
    ru: 'Как правило, да. Супруг(а) и несовершеннолетние дети обычно могут приехать в рамках воссоединения семьи при достаточном доходе и подходящем жилье; остальные условия зависят от конкретного случая. Многие семьи подают заявление после того, как основной заявитель обустроится в Германии.',
  },
};

const faqValidity: Faq = {
  q: {
    az: 'Viza nə qədər müddətə verilir və uzadıla bilərmi?',
    de: 'Wie lange gilt das Visum und kann es verlängert werden?',
    en: 'How long is the visa valid and can it be extended?',
    ru: 'На какой срок выдаётся виза и можно ли её продлить?',
  },
  a: {
    az: 'Əvvəlcə giriş üçün milli (D tipli) viza alırsınız. Almaniyada Əcnəbilər idarəsi daha sonra yaşayış icazəsi verir və onun müddəti adətən əmək müqaviləsinin müddətinə uyğunlaşdırılır. Şərtlər ödənildiyi müddətcə o, bir qayda olaraq, uzadıla bilər; bir neçə illik işdən sonra daimi yaşayış icazəsi almaq mümkün ola bilər. Dəqiq müddətlər fərdi vəziyyətdən asılıdır.',
    de: 'Zunächst erhalten Sie ein nationales Visum (Typ D) für die Einreise. In Deutschland stellt die Ausländerbehörde anschließend eine Aufenthaltserlaubnis aus, die sich in der Regel an der Dauer des Arbeitsvertrags orientiert. Sie kann grundsätzlich verlängert werden, solange die Voraussetzungen weiter erfüllt sind; nach mehreren Jahren Beschäftigung kann eine Niederlassungserlaubnis möglich werden. Die genauen Fristen hängen vom Einzelfall ab.',
    en: 'You first receive a national (type D) visa for entry. In Germany the foreigners’ authority then issues a residence permit, usually aligned with the duration of your employment contract. It can generally be extended as long as the requirements are still met, and after several years of employment a permanent settlement permit may become possible. Exact periods depend on your case.',
    ru: 'Сначала вы получаете национальную визу (тип D) для въезда. В Германии ведомство по делам иностранцев затем выдаёт вид на жительство, срок которого обычно привязан к сроку трудового договора. Как правило, его можно продлевать, пока выполняются условия, а после нескольких лет работы может стать возможным получение бессрочного вида на жительство. Точные сроки зависят от конкретного случая.',
  },
};

const faqSwitchEmployer: Faq = {
  q: {
    az: 'Sonradan işəgötürəni dəyişə bilərəmmi?',
    de: 'Kann ich später den Arbeitgeber wechseln?',
    en: 'Can I change employer later?',
    ru: 'Можно ли позже сменить работодателя?',
  },
  a: {
    az: 'Ümumilikdə bəli, lakin bu, yaşayış icazənizdən və yeni işdən asılıdır. İşəgötürənin dəyişdirilməsi, xüsusilə işin ilk dövründə, Əcnəbilər idarəsinə bildirilməli və ya onun tərəfindən təsdiqlənməli ola bilər. Yeni müqavilə imzalamazdan əvvəl bunu mütləq dəqiqləşdirin – fərdi vəziyyətinizi yoxlamaqda sizə kömək edə bilərik.',
    de: 'Grundsätzlich ja, es hängt jedoch von Ihrem Aufenthaltstitel und der neuen Stelle ab. Ein Wechsel kann – insbesondere in der ersten Zeit der Beschäftigung – der Ausländerbehörde anzuzeigen oder von ihr zu genehmigen sein. Bitte klären Sie dies immer vor der Unterschrift eines neuen Vertrags; wir helfen Ihnen gern, Ihren Einzelfall zu prüfen.',
    en: 'In general yes, but it depends on your residence permit and the new job. A change may have to be reported to, or approved by, the foreigners’ authority – especially in the first period of employment. Always clarify this before signing a new contract; we are happy to help you check your individual case.',
    ru: 'В целом да, но это зависит от вашего вида на жительство и новой работы. О смене работодателя — особенно в первый период занятости — может потребоваться уведомить ведомство по делам иностранцев или получить его разрешение. Обязательно уточните это до подписания нового договора — мы поможем проверить ваш конкретный случай.',
  },
};

// ---------------------------------------------------------------------------
// Visa categories
// ---------------------------------------------------------------------------

const visas: VisaEnrichment[] = [
  {
    slug: 'lkw-fahrer',
    germanLevel: 'A2',
    salaryMin: 2800, salaryMax: 3600,
    processingMin: 4, processingMax: 10,
    familyReunion: true,
    requirements: {
      az: [
        'Etibarlı C/CE kateqoriyalı sürücülük vəsiqəsi və peşəkar sürücü kimi sübut olunan təcrübə',
        'Almaniyada sürücülük vəsiqəsinin dəyişdirilməsinə (Führerscheinumschreibung) hazır olmaq',
        'Almaniyada Berufskraftfahrerqualifikation (kod 95) almaq və ya təsdiqləmək',
        'Təxminən A2 səviyyəsində alman dili (iş yerində və yolda ünsiyyət üçün)',
        'Alman nəqliyyat və ya ekspeditor şirkətindən konkret iş təklifi',
        'Lazım olduqda Federal Məşğulluq Agentliyinin razılığı',
      ],
      de: [
        'Gültige Fahrerlaubnis der Klasse C/CE und nachweisbare Berufserfahrung als Fahrer',
        'Bereitschaft zur Führerscheinumschreibung in Deutschland',
        'Erwerb bzw. Nachweis der Berufskraftfahrerqualifikation (Schlüsselzahl 95) in Deutschland',
        'Deutschkenntnisse etwa auf Niveau A2 für die Verständigung im Betrieb und unterwegs',
        'Konkretes Arbeitsplatzangebot einer deutschen Spedition oder eines Transportunternehmens',
        'Zustimmung der Bundesagentur für Arbeit, soweit erforderlich',
      ],
      en: [
        'Valid C/CE driving licence and verifiable professional driving experience',
        'Willingness to convert the licence in Germany (Führerscheinumschreibung)',
        'Obtaining or proving the driver qualification (code 95, Berufskraftfahrerqualifikation) in Germany',
        'German at around A2 level for communication at the depot and on the road',
        'A concrete job offer from a German haulage or forwarding company',
        'Approval of the Federal Employment Agency where required',
      ],
      ru: [
        'Действующее водительское удостоверение категории C/CE и подтверждённый опыт работы водителем',
        'Готовность заменить удостоверение в Германии (Führerscheinumschreibung)',
        'Получение или подтверждение квалификации профессионального водителя (код 95) в Германии',
        'Немецкий примерно на уровне A2 для общения на базе и в рейсе',
        'Конкретное предложение о работе от немецкой транспортной или экспедиторской компании',
        'Согласие Федерального агентства по труду, если оно требуется',
      ],
    },
    documents: {
      az: [
        'Etibarlı xarici pasport',
        'Biometrik fotoşəkillər',
        'Doldurulmuş viza ərizə forması (VIDEX)',
        'Əmək müqaviləsi və ya iş təklifi',
        'Sürücülük vəsiqəsi (C/CE) və təsdiqlənmiş tərcüməsi',
        'Sürücü kimi iş təcrübəsini təsdiq edən sənədlər (iş kitabçası, arayışlar)',
        'Lazım olduqda Federal Məşğulluq Agentliyinin ilkin razılığı (Vorabzustimmung)',
        'Alman dilində tərcümeyi-hal (CV)',
        'Tibbi sığortanın sübutu',
      ],
      de: [
        'Gültiger Reisepass',
        'Biometrische Passfotos',
        'Ausgefüllter Visumantrag (VIDEX)',
        'Arbeitsvertrag oder verbindliches Arbeitsplatzangebot',
        'Führerschein (C/CE) mit beglaubigter Übersetzung',
        'Nachweise der Fahrpraxis (Arbeitsbuch, Arbeitszeugnisse)',
        'Vorabzustimmung der Bundesagentur für Arbeit, soweit erforderlich',
        'Lebenslauf auf Deutsch',
        'Nachweis der Krankenversicherung',
      ],
      en: [
        'Valid passport',
        'Biometric photos',
        'Completed visa application form (VIDEX)',
        'Employment contract or binding job offer',
        'Driving licence (C/CE) with certified translation',
        'Proof of driving experience (employment record book, references)',
        'Pre-approval of the Federal Employment Agency (Vorabzustimmung) where required',
        'CV in German',
        'Proof of health insurance',
      ],
      ru: [
        'Действующий заграничный паспорт',
        'Биометрические фотографии',
        'Заполненная визовая анкета (VIDEX)',
        'Трудовой договор или обязывающее предложение о работе',
        'Водительское удостоверение (C/CE) с заверенным переводом',
        'Подтверждение опыта вождения (трудовая книжка, рекомендации)',
        'Предварительное согласие Федерального агентства по труду (Vorabzustimmung), если требуется',
        'Резюме на немецком языке',
        'Подтверждение медицинской страховки',
      ],
    },
    faq: [
      {
        q: {
          az: 'Azərbaycan sürücülük vəsiqəm Almaniyada etibarlıdırmı?',
          de: 'Gilt mein aserbaidschanischer Führerschein in Deutschland?',
          en: 'Is my Azerbaijani driving licence valid in Germany?',
          ru: 'Действует ли моё азербайджанское удостоверение в Германии?',
        },
        a: {
          az: 'Peşəkar yük daşımaları üçün vəsiqə alman vəsiqəsinə dəyişdirilməlidir (Führerscheinumschreibung). Bunun üçün adətən nəzəri və praktiki imtahanlar, həmçinin kod 95 tələb olunur. Tələblər vəsiqənizdən və federal torpaqdan asılıdır; biz işəgötürənlə birlikdə prosesi planlaşdırırıq.',
          de: 'Für den gewerblichen Güterverkehr muss die Fahrerlaubnis in eine deutsche umgeschrieben werden (Führerscheinumschreibung). In der Regel sind dafür theoretische und praktische Prüfungen sowie die Schlüsselzahl 95 erforderlich. Die genauen Anforderungen hängen von Ihrem Führerschein und dem Bundesland ab; wir planen den Ablauf gemeinsam mit dem Arbeitgeber.',
          en: 'For commercial haulage the licence must be converted into a German one (Führerscheinumschreibung). This usually involves theory and practical tests as well as code 95. The exact requirements depend on your licence and the federal state; we plan the process together with the employer.',
          ru: 'Для коммерческих грузоперевозок удостоверение нужно заменить на немецкое (Führerscheinumschreibung). Обычно для этого требуются теоретический и практический экзамены, а также код 95. Точные требования зависят от вашего удостоверения и федеральной земли; мы планируем процесс вместе с работодателем.',
        },
      },
      faqFamily,
      faqSalary,
      faqValidity,
    ],
  },
  {
    slug: 'kurierfahrer',
    germanLevel: 'A2',
    salaryMin: 2400, salaryMax: 2900,
    processingMin: 4, processingMax: 8,
    familyReunion: true,
    requirements: {
      az: [
        'B kateqoriyalı sürücülük vəsiqəsi və real sürücülük təcrübəsi',
        'Konkret iş təklifi olan alman kuryer və ya çatdırılma şirkəti',
        'Ünvanları tapmaq və müştərilərlə danışmaq üçün təxminən A2 səviyyəsində alman dili',
        'Lazım olduqda Federal Məşğulluq Agentliyinin razılığı',
        'Gələcəkdə vəsiqənin Almaniyada dəyişdirilməsinə hazır olmaq',
      ],
      de: [
        'Fahrerlaubnis der Klasse B und tatsächliche Fahrpraxis',
        'Konkretes Arbeitsplatzangebot eines deutschen Kurier- oder Zustelldienstes',
        'Deutschkenntnisse etwa auf Niveau A2 für Adressen und Kundenkontakt',
        'Zustimmung der Bundesagentur für Arbeit, soweit erforderlich',
        'Bereitschaft zur späteren Umschreibung des Führerscheins in Deutschland',
      ],
      en: [
        'Category B driving licence and real driving experience',
        'A concrete job offer from a German courier or delivery company',
        'German at around A2 level for addresses and customer contact',
        'Approval of the Federal Employment Agency where required',
        'Willingness to convert the licence in Germany later on',
      ],
      ru: [
        'Водительское удостоверение категории B и реальный опыт вождения',
        'Конкретное предложение о работе от немецкой курьерской службы или службы доставки',
        'Немецкий примерно на уровне A2 для работы с адресами и общения с клиентами',
        'Согласие Федерального агентства по труду, если оно требуется',
        'Готовность позднее заменить удостоверение в Германии',
      ],
    },
    documents: {
      az: [
        'Etibarlı xarici pasport',
        'Biometrik fotoşəkillər',
        'Doldurulmuş viza ərizə forması (VIDEX)',
        'Əmək müqaviləsi və ya iş təklifi',
        'Lazım olduqda iş münasibəti haqqında bəyannamə (Erklärung zum Beschäftigungsverhältnis)',
        'Sürücülük vəsiqəsi (B) və təsdiqlənmiş tərcüməsi',
        'Alman dilində tərcümeyi-hal (CV)',
        'Varsa, alman dili sertifikatı',
        'Tibbi sığortanın sübutu',
      ],
      de: [
        'Gültiger Reisepass',
        'Biometrische Passfotos',
        'Ausgefüllter Visumantrag (VIDEX)',
        'Arbeitsvertrag oder verbindliches Arbeitsplatzangebot',
        'Erklärung zum Beschäftigungsverhältnis, soweit erforderlich',
        'Führerschein (Klasse B) mit beglaubigter Übersetzung',
        'Lebenslauf auf Deutsch',
        'Deutsch-Sprachzertifikat, falls vorhanden',
        'Nachweis der Krankenversicherung',
      ],
      en: [
        'Valid passport',
        'Biometric photos',
        'Completed visa application form (VIDEX)',
        'Employment contract or binding job offer',
        'Declaration of employment relationship (Erklärung zum Beschäftigungsverhältnis) where required',
        'Driving licence (category B) with certified translation',
        'CV in German',
        'German language certificate, if available',
        'Proof of health insurance',
      ],
      ru: [
        'Действующий заграничный паспорт',
        'Биометрические фотографии',
        'Заполненная визовая анкета (VIDEX)',
        'Трудовой договор или обязывающее предложение о работе',
        'Декларация о трудовых отношениях (Erklärung zum Beschäftigungsverhältnis), если требуется',
        'Водительское удостоверение (категория B) с заверенным переводом',
        'Резюме на немецком языке',
        'Сертификат по немецкому языку, если есть',
        'Подтверждение медицинской страховки',
      ],
    },
    faq: [
      {
        q: {
          az: 'Gəlişdən əvvəl alman dilini bilməliyəmmi?',
          de: 'Muss ich vor der Einreise Deutsch können?',
          en: 'Do I need German before arrival?',
          ru: 'Нужно ли знать немецкий до приезда?',
        },
        a: {
          az: 'Bəli, əsas biliklər lazımdır: kuryer hər gün ünvanlarla, müştərilərlə və dispetçerlə işləyir. Əksər işəgötürənlər təxminən A2 səviyyəsini gözləyir. Rəsmi sertifikat tələb olunub-olunmaması işəgötürəndən və konkret haldan asılıdır.',
          de: 'Ja, Grundkenntnisse sind nötig: Kurierfahrer arbeiten täglich mit Adressen, Kunden und der Disposition. Die meisten Arbeitgeber erwarten etwa Niveau A2. Ob ein offizielles Zertifikat verlangt wird, hängt vom Arbeitgeber und vom Einzelfall ab.',
          en: 'Yes, basic German is needed: couriers deal with addresses, customers and dispatch every day. Most employers expect around A2. Whether an official certificate is required depends on the employer and the individual case.',
          ru: 'Да, базовые знания нужны: курьер ежедневно работает с адресами, клиентами и диспетчером. Большинство работодателей ожидают уровень около A2. Требуется ли официальный сертификат, зависит от работодателя и конкретного случая.',
        },
      },
      faqFamily,
      faqSalary,
      faqSwitchEmployer,
    ],
  },
  {
    slug: 'gastronomie-hotel',
    germanLevel: 'A2–B1',
    salaryMin: 2400, salaryMax: 3100,
    processingMin: 4, processingMax: 8,
    familyReunion: true,
    requirements: {
      az: [
        'Aşpaz, ofisiant və ya otel işçisi kimi peşə təhsili və ya sübut olunan təcrübə',
        'Alman restoranı, oteli və ya ketrinq şirkətindən konkret iş təklifi',
        'Vəzifədən asılı olaraq A2–B1 səviyyəsində alman dili (qonaqlarla işdə daha yüksək)',
        'Lazım olduqda Federal Məşğulluq Agentliyinin razılığı',
        'Peşə təhsili olduqda, tələb olunarsa, onun tanınması',
      ],
      de: [
        'Berufsausbildung oder nachweisbare Erfahrung als Koch, Servicekraft oder im Hotelbereich',
        'Konkretes Arbeitsplatzangebot eines deutschen Restaurants, Hotels oder Caterers',
        'Deutschkenntnisse je nach Position auf Niveau A2–B1 (mit Gästekontakt eher höher)',
        'Zustimmung der Bundesagentur für Arbeit, soweit erforderlich',
        'Anerkennung der Berufsausbildung, sofern für das Visum erforderlich',
      ],
      en: [
        'Vocational training or proven experience as a chef, waiter or in hotel work',
        'A concrete job offer from a German restaurant, hotel or catering company',
        'German at A2–B1 depending on the position (higher with guest contact)',
        'Approval of the Federal Employment Agency where required',
        'Recognition of the vocational qualification where the visa route requires it',
      ],
      ru: [
        'Профессиональное образование или подтверждённый опыт работы поваром, официантом или в отеле',
        'Конкретное предложение о работе от немецкого ресторана, отеля или кейтеринга',
        'Немецкий на уровне A2–B1 в зависимости от должности (при работе с гостями — выше)',
        'Согласие Федерального агентства по труду, если оно требуется',
        'Признание профессиональной квалификации, если этого требует визовый путь',
      ],
    },
    documents: {
      az: [
        'Etibarlı xarici pasport',
        'Biometrik fotoşəkillər',
        'Doldurulmuş viza ərizə forması (VIDEX)',
        'Əmək müqaviləsi və ya iş təklifi',
        'Lazım olduqda iş münasibəti haqqında bəyannamə və ilkin razılıq (Vorabzustimmung)',
        'Diplom, sertifikat və iş arayışları – təsdiqlənmiş tərcümə ilə',
        'Alman dilində tərcümeyi-hal (CV)',
        'Tələb olunduqda alman dili sertifikatı',
        'Tibbi sığortanın sübutu',
      ],
      de: [
        'Gültiger Reisepass',
        'Biometrische Passfotos',
        'Ausgefüllter Visumantrag (VIDEX)',
        'Arbeitsvertrag oder verbindliches Arbeitsplatzangebot',
        'Erklärung zum Beschäftigungsverhältnis und Vorabzustimmung, soweit erforderlich',
        'Abschlüsse, Zertifikate und Arbeitszeugnisse mit beglaubigter Übersetzung',
        'Lebenslauf auf Deutsch',
        'Deutsch-Sprachzertifikat, soweit verlangt',
        'Nachweis der Krankenversicherung',
      ],
      en: [
        'Valid passport',
        'Biometric photos',
        'Completed visa application form (VIDEX)',
        'Employment contract or binding job offer',
        'Declaration of employment relationship and pre-approval (Vorabzustimmung) where required',
        'Diplomas, certificates and references with certified translations',
        'CV in German',
        'German language certificate where required',
        'Proof of health insurance',
      ],
      ru: [
        'Действующий заграничный паспорт',
        'Биометрические фотографии',
        'Заполненная визовая анкета (VIDEX)',
        'Трудовой договор или обязывающее предложение о работе',
        'Декларация о трудовых отношениях и предварительное согласие (Vorabzustimmung), если требуется',
        'Дипломы, сертификаты и рекомендации с заверенными переводами',
        'Резюме на немецком языке',
        'Сертификат по немецкому языку, если требуется',
        'Подтверждение медицинской страховки',
      ],
    },
    faq: [
      {
        q: {
          az: 'Hansı səviyyədə alman dili lazımdır?',
          de: 'Welches Deutschniveau brauche ich?',
          en: 'What level of German do I need?',
          ru: 'Какой уровень немецкого нужен?',
        },
        a: {
          az: 'Mətbəxdə işləmək üçün çox vaxt A2 kifayət edir, qonaqlarla birbaşa işləyən vəzifələr (xidmət, resepşn) üçün isə adətən B1 gözlənilir. Dəqiq tələb işəgötürəndən və vəzifədən asılıdır.',
          de: 'Für die Küche reicht oft A2, für Positionen mit direktem Gästekontakt (Service, Rezeption) wird in der Regel B1 erwartet. Die genaue Anforderung hängt vom Arbeitgeber und der Position ab.',
          en: 'A2 is often enough for kitchen work, while positions with direct guest contact (service, reception) usually expect B1. The exact requirement depends on the employer and the position.',
          ru: 'Для работы на кухне часто достаточно A2, а для должностей с прямым контактом с гостями (обслуживание, ресепшн) обычно ожидается B1. Точное требование зависит от работодателя и должности.',
        },
      },
      faqFamily,
      faqSalary,
      faqSwitchEmployer,
    ],
  },
  {
    slug: 'bau-handwerk',
    germanLevel: 'A2',
    salaryMin: 2700, salaryMax: 3500,
    processingMin: 6, processingMax: 12,
    familyReunion: true,
    requirements: {
      az: [
        'Müvafiq peşə üzrə tanınmış peşə təhsili (§18a) və ya tələb olunduqda alternativ yol üçün təcrübə',
        'Alman tikinti və ya sənətkarlıq şirkətindən konkret iş təklifi',
        'Lazım olduqda Federal Məşğulluq Agentliyinin ilkin razılığı (Vorabzustimmung)',
        'Təhlükəsizlik təlimatlarını başa düşmək üçün təxminən A2 səviyyəsində alman dili',
        'Tənzimlənən peşələr (məs. elektrik) üçün tanınma qərarı (Anerkennungsbescheid)',
      ],
      de: [
        'Anerkannte Berufsausbildung im jeweiligen Gewerk (§18a) bzw. Berufserfahrung für alternative Wege, soweit zulässig',
        'Konkretes Arbeitsplatzangebot eines deutschen Bau- oder Handwerksbetriebs',
        'Vorabzustimmung der Bundesagentur für Arbeit, soweit erforderlich',
        'Deutschkenntnisse etwa auf Niveau A2, um Sicherheitsunterweisungen zu verstehen',
        'Anerkennungsbescheid für reglementierte Tätigkeiten (z. B. Elektro)',
      ],
      en: [
        'A recognised vocational qualification in the trade (§18a) or experience for alternative routes where permitted',
        'A concrete job offer from a German construction or trade company',
        'Pre-approval of the Federal Employment Agency (Vorabzustimmung) where required',
        'German at around A2 level to understand safety instructions',
        'Recognition notice (Anerkennungsbescheid) for regulated activities (e.g. electrical work)',
      ],
      ru: [
        'Признанное профессиональное образование по специальности (§18a) или опыт для альтернативных путей, если они допустимы',
        'Конкретное предложение о работе от немецкой строительной или ремесленной компании',
        'Предварительное согласие Федерального агентства по труду (Vorabzustimmung), если требуется',
        'Немецкий примерно на уровне A2, чтобы понимать инструктажи по технике безопасности',
        'Решение о признании (Anerkennungsbescheid) для регулируемых видов работ (например, электромонтаж)',
      ],
    },
    documents: {
      az: [
        'Etibarlı xarici pasport',
        'Biometrik fotoşəkillər',
        'Doldurulmuş viza ərizə forması (VIDEX)',
        'Əmək müqaviləsi və ya iş təklifi',
        'Lazım olduqda ilkin razılıq (Vorabzustimmung) və iş münasibəti haqqında bəyannamə',
        'Tanınma qərarı (Anerkennungsbescheid) və ya tanınma prosedurunun sübutu',
        'Peşə diplomu, sertifikatlar və iş arayışları – təsdiqlənmiş tərcümə ilə',
        'Alman dilində tərcümeyi-hal (CV)',
        'Tibbi sığortanın sübutu',
      ],
      de: [
        'Gültiger Reisepass',
        'Biometrische Passfotos',
        'Ausgefüllter Visumantrag (VIDEX)',
        'Arbeitsvertrag oder verbindliches Arbeitsplatzangebot',
        'Vorabzustimmung und Erklärung zum Beschäftigungsverhältnis, soweit erforderlich',
        'Anerkennungsbescheid oder Nachweis über das laufende Anerkennungsverfahren',
        'Berufsabschluss, Zertifikate und Arbeitszeugnisse mit beglaubigter Übersetzung',
        'Lebenslauf auf Deutsch',
        'Nachweis der Krankenversicherung',
      ],
      en: [
        'Valid passport',
        'Biometric photos',
        'Completed visa application form (VIDEX)',
        'Employment contract or binding job offer',
        'Pre-approval (Vorabzustimmung) and declaration of employment relationship where required',
        'Recognition notice (Anerkennungsbescheid) or proof of an ongoing recognition procedure',
        'Vocational diploma, certificates and references with certified translations',
        'CV in German',
        'Proof of health insurance',
      ],
      ru: [
        'Действующий заграничный паспорт',
        'Биометрические фотографии',
        'Заполненная визовая анкета (VIDEX)',
        'Трудовой договор или обязывающее предложение о работе',
        'Предварительное согласие (Vorabzustimmung) и декларация о трудовых отношениях, если требуется',
        'Решение о признании (Anerkennungsbescheid) или подтверждение текущей процедуры признания',
        'Диплом о профессиональном образовании, сертификаты и рекомендации с заверенными переводами',
        'Резюме на немецком языке',
        'Подтверждение медицинской страховки',
      ],
    },
    faq: [
      {
        q: {
          az: 'Diplomumun tanınması mütləqdirmi?',
          de: 'Muss mein Abschluss unbedingt anerkannt werden?',
          en: 'Does my qualification have to be recognised?',
          ru: 'Обязательно ли признание моего диплома?',
        },
        a: {
          az: 'Bu, viza yolundan və peşədən asılıdır. İxtisaslı işçi vizası (§18a) üçün adətən tanınmış peşə təhsili tələb olunur, tənzimlənən işlər üçün isə tanınma hər halda vacibdir. Bəzi hallarda təcrübəyə əsaslanan alternativ yollar mümkündür – sənədlərinizi yoxlayıb uyğun yolu təklif edirik.',
          de: 'Das hängt vom Visumweg und vom Beruf ab. Für das Fachkräftevisum (§18a) ist in der Regel ein anerkannter Berufsabschluss nötig, für reglementierte Tätigkeiten ist die Anerkennung ohnehin Pflicht. In manchen Fällen gibt es alternative Wege über Berufserfahrung – wir prüfen Ihre Unterlagen und schlagen den passenden Weg vor.',
          en: 'It depends on the visa route and the trade. The skilled-worker visa (§18a) usually requires a recognised vocational qualification, and for regulated activities recognition is mandatory anyway. In some cases alternative routes based on experience exist – we check your documents and suggest the right route.',
          ru: 'Это зависит от визового пути и профессии. Для визы квалифицированного специалиста (§18a) обычно нужно признанное профессиональное образование, а для регулируемых видов работ признание обязательно в любом случае. В некоторых случаях есть альтернативные пути на основе опыта — мы проверим ваши документы и предложим подходящий вариант.',
        },
      },
      faqFamily,
      faqSalary,
      faqValidity,
    ],
  },
  {
    slug: 'pflege-gesundheit',
    germanLevel: 'B1–B2',
    salaryMin: 2600, salaryMax: 3900,
    processingMin: 8, processingMax: 16,
    familyReunion: true,
    requirements: {
      az: [
        'Tibb bacısı diplomu və onun Almaniyada tanınması (Anerkennung)',
        'Tam tanınma olmadıqda: tanınma tərəfdaşlığı və ya Almaniyada uyğunlaşma tədbiri (§16d)',
        'Başlamaq üçün alman dili B1, tam tanınma üçün adətən B2 (çox vaxt peşə dili imtahanı ilə)',
        'Klinika, qocalar evi və ya qulluq xidmətindən konkret iş və ya uyğunlaşma təklifi',
        'Tibb bacısı köməkçiləri üçün şərtlər fərqlidir və federal torpaqdan asılıdır',
      ],
      de: [
        'Pflegeabschluss und dessen Anerkennung in Deutschland',
        'Bei Teilanerkennung: Anerkennungspartnerschaft oder Anpassungsmaßnahme in Deutschland (§16d)',
        'Deutsch B1 für den Einstieg, für die volle Anerkennung in der Regel B2 (oft mit Fachsprachprüfung)',
        'Konkretes Arbeits- oder Anpassungsangebot einer Klinik, eines Pflegeheims oder Pflegedienstes',
        'Für Pflegehilfskräfte gelten abweichende Voraussetzungen, die vom Bundesland abhängen',
      ],
      en: [
        'A nursing diploma and its recognition in Germany (Anerkennung)',
        'If recognition is partial: a recognition partnership or adaptation measure in Germany (§16d)',
        'German B1 to start; usually B2 for full recognition (often with a professional language exam)',
        'A concrete job or adaptation offer from a hospital, care home or care service',
        'Different requirements apply to nursing assistants and depend on the federal state',
      ],
      ru: [
        'Диплом медсестры/медбрата и его признание в Германии (Anerkennung)',
        'При частичном признании: партнёрство по признанию или адаптационная мера в Германии (§16d)',
        'Немецкий B1 для старта, для полного признания обычно B2 (часто с экзаменом по профессиональному языку)',
        'Конкретное предложение о работе или адаптации от клиники, дома престарелых или службы ухода',
        'Для помощников по уходу действуют другие условия, зависящие от федеральной земли',
      ],
    },
    documents: {
      az: [
        'Etibarlı xarici pasport',
        'Biometrik fotoşəkillər',
        'Doldurulmuş viza ərizə forması (VIDEX)',
        'Əmək müqaviləsi, iş təklifi və ya uyğunlaşma tədbiri üzrə təsdiq',
        'Tanınma qərarı (Anerkennungsbescheid) və ya çatışmazlıqlar haqqında qərar (Defizitbescheid)',
        'Tibb bacısı diplomu, fənlər və saatlar üzrə əlavə, təcrübə arayışları – təsdiqlənmiş tərcümə ilə',
        'Alman dili sertifikatı (B1/B2)',
        'Alman dilində tərcümeyi-hal (CV)',
        'Tibbi sığortanın sübutu',
      ],
      de: [
        'Gültiger Reisepass',
        'Biometrische Passfotos',
        'Ausgefüllter Visumantrag (VIDEX)',
        'Arbeitsvertrag, Arbeitsplatzangebot oder Zusage für die Anpassungsmaßnahme',
        'Anerkennungsbescheid oder Defizitbescheid',
        'Pflegediplom, Fächer- und Stundennachweis, Praxisnachweise mit beglaubigter Übersetzung',
        'Deutsch-Sprachzertifikat (B1/B2)',
        'Lebenslauf auf Deutsch',
        'Nachweis der Krankenversicherung',
      ],
      en: [
        'Valid passport',
        'Biometric photos',
        'Completed visa application form (VIDEX)',
        'Employment contract, job offer or confirmation of the adaptation measure',
        'Recognition notice (Anerkennungsbescheid) or deficit notice (Defizitbescheid)',
        'Nursing diploma, transcript of subjects and hours, proof of practice – with certified translations',
        'German language certificate (B1/B2)',
        'CV in German',
        'Proof of health insurance',
      ],
      ru: [
        'Действующий заграничный паспорт',
        'Биометрические фотографии',
        'Заполненная визовая анкета (VIDEX)',
        'Трудовой договор, предложение о работе или подтверждение адаптационной меры',
        'Решение о признании (Anerkennungsbescheid) или решение о недостатках (Defizitbescheid)',
        'Диплом, приложение с предметами и часами, подтверждение практики — с заверенными переводами',
        'Сертификат по немецкому языку (B1/B2)',
        'Резюме на немецком языке',
        'Подтверждение медицинской страховки',
      ],
    },
    faq: [
      {
        q: {
          az: 'Diplomumun tanınması nə qədər çəkir?',
          de: 'Wie lange dauert die Anerkennung meines Abschlusses?',
          en: 'How long does recognition of my diploma take?',
          ru: 'Сколько длится признание моего диплома?',
        },
        a: {
          az: 'Bu, səlahiyyətli qurumdan və sənədlərin tamlığından asılıdır; adətən bir neçə ay çəkir. Tanınma qismən olarsa, çatışmazlıqları Almaniyada uyğunlaşma tədbiri və ya bilik imtahanı ilə aradan qaldırmaq olar (§16d). Bu müddətdə köməkçi kimi işləmək çox vaxt mümkündür.',
          de: 'Das hängt von der zuständigen Behörde und der Vollständigkeit der Unterlagen ab; meist dauert es einige Monate. Bei einer Teilanerkennung können die Defizite in Deutschland über eine Anpassungsmaßnahme oder Kenntnisprüfung ausgeglichen werden (§16d). In dieser Zeit ist eine Tätigkeit als Pflegehilfskraft oft möglich.',
          en: 'It depends on the competent authority and how complete the documents are; it usually takes several months. If recognition is partial, the gaps can be closed in Germany through an adaptation measure or knowledge test (§16d). During this time working as a nursing assistant is often possible.',
          ru: 'Это зависит от компетентного ведомства и полноты документов; обычно процесс занимает несколько месяцев. При частичном признании пробелы можно закрыть в Германии через адаптационную меру или экзамен на знания (§16d). В этот период часто можно работать помощником по уходу.',
        },
      },
      {
        q: {
          az: 'Gəlişdən əvvəl alman dilini bilməliyəmmi?',
          de: 'Muss ich vor der Einreise Deutsch können?',
          en: 'Do I need German before arrival?',
          ru: 'Нужно ли знать немецкий до приезда?',
        },
        a: {
          az: 'Bəli. Səhiyyədə dil xəstələrin təhlükəsizliyi üçün vacibdir: viza üçün adətən ən azı B1 tələb olunur, tam tanınma üçün isə çox vaxt B2 və peşə dili imtahanı lazımdır. Dəqiq tələb federal torpaqdan və viza yolundan asılıdır.',
          de: 'Ja. In der Pflege ist Sprache eine Frage der Patientensicherheit: Für das Visum wird in der Regel mindestens B1 verlangt, für die volle Anerkennung meist B2 und eine Fachsprachprüfung. Die genaue Anforderung hängt vom Bundesland und vom Visumweg ab.',
          en: 'Yes. In healthcare, language is a matter of patient safety: the visa usually requires at least B1, and full recognition typically requires B2 and a professional language exam. The exact requirement depends on the federal state and the visa route.',
          ru: 'Да. В здравоохранении язык — вопрос безопасности пациентов: для визы обычно нужен как минимум B1, а для полного признания, как правило, B2 и экзамен по профессиональному языку. Точное требование зависит от федеральной земли и визового пути.',
        },
      },
      faqFamily,
      faqSalary,
    ],
  },
  {
    slug: 'landwirtschaft',
    germanLevel: 'A1',
    salaryMin: 2400, salaryMax: 2700,
    processingMin: 3, processingMax: 6,
    familyReunion: false,
    requirements: {
      az: [
        'Alman kənd təsərrüfatı müəssisəsindən mövsümi iş təklifi',
        '12 ay ərzində ən çoxu 8 aylıq məşğulluq',
        'Federal Məşğulluq Agentliyinin prosedurları çərçivəsində yerləşdirmə (imkanlar cari proqramlardan asılıdır)',
        'Fiziki dözümlülük və açıq havada işləməyə hazırlıq',
        'Təxminən A1 səviyyəsində əsas alman dili arzuolunandır',
      ],
      de: [
        'Saisonarbeitsangebot eines deutschen landwirtschaftlichen Betriebs',
        'Beschäftigung von höchstens 8 Monaten innerhalb von 12 Monaten',
        'Vermittlung im Rahmen der Verfahren der Bundesagentur für Arbeit (Möglichkeiten hängen von aktuellen Programmen ab)',
        'Körperliche Belastbarkeit und Bereitschaft zur Arbeit im Freien',
        'Grundkenntnisse in Deutsch etwa auf Niveau A1 sind von Vorteil',
      ],
      en: [
        'A seasonal job offer from a German agricultural business',
        'Employment of no more than 8 months within 12 months',
        'Placement within the Federal Employment Agency’s procedures (availability depends on current programmes)',
        'Physical fitness and willingness to work outdoors',
        'Basic German at around A1 level is an advantage',
      ],
      ru: [
        'Предложение сезонной работы от немецкого сельскохозяйственного предприятия',
        'Занятость не более 8 месяцев в течение 12 месяцев',
        'Трудоустройство в рамках процедур Федерального агентства по труду (возможности зависят от текущих программ)',
        'Физическая выносливость и готовность работать на открытом воздухе',
        'Базовый немецкий примерно на уровне A1 будет преимуществом',
      ],
    },
    documents: {
      az: [
        'Etibarlı xarici pasport',
        'Biometrik fotoşəkillər',
        'Doldurulmuş viza ərizə forması (VIDEX)',
        'Mövsümi əmək müqaviləsi və ya iş təklifi',
        'Federal Məşğulluq Agentliyinin müvafiq təsdiqi',
        'İşəgötürən tərəfindən təmin edilən yaşayış yeri haqqında məlumat',
        'Tibbi sığortanın sübutu',
      ],
      de: [
        'Gültiger Reisepass',
        'Biometrische Passfotos',
        'Ausgefüllter Visumantrag (VIDEX)',
        'Saisonarbeitsvertrag oder Arbeitsplatzangebot',
        'Entsprechende Zustimmung bzw. Bestätigung der Bundesagentur für Arbeit',
        'Angaben zur vom Arbeitgeber gestellten Unterkunft',
        'Nachweis der Krankenversicherung',
      ],
      en: [
        'Valid passport',
        'Biometric photos',
        'Completed visa application form (VIDEX)',
        'Seasonal employment contract or job offer',
        'The relevant approval or confirmation of the Federal Employment Agency',
        'Details of the accommodation provided by the employer',
        'Proof of health insurance',
      ],
      ru: [
        'Действующий заграничный паспорт',
        'Биометрические фотографии',
        'Заполненная визовая анкета (VIDEX)',
        'Сезонный трудовой договор или предложение о работе',
        'Соответствующее согласие или подтверждение Федерального агентства по труду',
        'Сведения о жилье, предоставляемом работодателем',
        'Подтверждение медицинской страховки',
      ],
    },
    faq: [
      {
        q: {
          az: 'Ailəmi özümlə apara bilərəmmi?',
          de: 'Kann ich meine Familie mitnehmen?',
          en: 'Can I bring my family?',
          ru: 'Могу ли я взять с собой семью?',
        },
        a: {
          az: 'Xeyr. Mövsümi iş müvəqqəti məşğulluqdur və ailənin birləşdirilməsi hüququ vermir. Ailə üzvləri yalnız özləri ayrıca viza əsasına malik olduqda gələ bilərlər.',
          de: 'Nein. Saisonarbeit ist eine befristete Beschäftigung und begründet keinen Anspruch auf Familiennachzug. Angehörige können nur kommen, wenn sie selbst einen eigenen Aufenthaltszweck haben.',
          en: 'No. Seasonal work is temporary employment and does not give a right to family reunification. Family members can only come if they have their own separate basis for a visa.',
          ru: 'Нет. Сезонная работа — это временная занятость, и она не даёт права на воссоединение семьи. Члены семьи могут приехать, только если у них есть собственное основание для визы.',
        },
      },
      {
        q: {
          az: 'Növbəti mövsümdə yenidən gələ bilərəmmi?',
          de: 'Kann ich in der nächsten Saison wiederkommen?',
          en: 'Can I come back next season?',
          ru: 'Можно ли приехать снова в следующем сезоне?',
        },
        a: {
          az: 'Çox vaxt bəli – razı qalan işəgötürənlər işçilərini yenidən dəvət edirlər. Hər mövsüm üçün yeni prosedur lazımdır və 12 ay ərzində 8 aylıq hədd qüvvədə qalır. Bu, cari proqramlardan və işəgötürəndən asılıdır.',
          de: 'Oft ja – zufriedene Betriebe laden ihre Saisonkräfte gern erneut ein. Für jede Saison ist ein neues Verfahren nötig, und die Grenze von 8 Monaten innerhalb von 12 Monaten gilt weiterhin. Es hängt von den aktuellen Programmen und dem Arbeitgeber ab.',
          en: 'Often yes – satisfied farms like to invite their seasonal workers again. Each season requires a new procedure, and the limit of 8 months within 12 months still applies. It depends on current programmes and the employer.',
          ru: 'Часто да — довольные хозяйства охотно приглашают сезонных работников снова. На каждый сезон нужна новая процедура, и ограничение 8 месяцев в течение 12 месяцев сохраняется. Это зависит от текущих программ и работодателя.',
        },
      },
      {
        q: {
          az: 'Yaşayış yeri və maaş necə təşkil olunur?',
          de: 'Wie sind Unterkunft und Bezahlung geregelt?',
          en: 'How are accommodation and pay arranged?',
          ru: 'Как организованы жильё и оплата?',
        },
        a: {
          az: 'Yaşayış yeri adətən işəgötürən tərəfindən təşkil olunur; xərcin bir hissəsi maaşdan tutula bilər – şərtlər müqavilədə göstərilir. Qanuni minimum əmək haqqı mövsümi işçilərə də şamil olunur. Göstərilən maaş aralığı təxminidir və zəmanət deyil.',
          de: 'Die Unterkunft wird in der Regel vom Arbeitgeber organisiert; ein Teil der Kosten kann vom Lohn einbehalten werden – die Bedingungen stehen im Vertrag. Der gesetzliche Mindestlohn gilt auch für Saisonkräfte. Die angegebene Gehaltsspanne ist unverbindlich und keine Garantie.',
          en: 'Accommodation is usually arranged by the employer; part of the cost may be deducted from your pay – the terms are set out in the contract. The statutory minimum wage also applies to seasonal workers. The salary range shown is indicative, not a guarantee.',
          ru: 'Жильё обычно организует работодатель; часть расходов может удерживаться из зарплаты — условия указываются в договоре. Установленная законом минимальная оплата труда распространяется и на сезонных работников. Указанный диапазон зарплаты ориентировочный и не является гарантией.',
        },
      },
    ],
  },
  {
    slug: 'industrie-technik',
    germanLevel: 'A2–B1',
    salaryMin: 2800, salaryMax: 3700,
    processingMin: 6, processingMax: 12,
    familyReunion: true,
    requirements: {
      az: [
        'Tanınmış peşə təhsili (§18a) və ya ali təhsil (§18b) – məs. qaynaqçı, operator, elektrik',
        'Alman sənaye müəssisəsindən ixtisasa uyğun konkret iş təklifi',
        'Lazım olduqda Federal Məşğulluq Agentliyinin ilkin razılığı (Vorabzustimmung)',
        'İstehsalatda ünsiyyət üçün A2–B1 səviyyəsində alman dili',
        'Qaynaqçılar üçün beynəlxalq sertifikatlar (məs. ISO 9606) üstünlükdür',
      ],
      de: [
        'Anerkannte Berufsausbildung (§18a) oder Hochschulabschluss (§18b) – z. B. Schweißer, Maschinenbediener, Elektriker',
        'Konkretes, zur Qualifikation passendes Arbeitsplatzangebot eines deutschen Industriebetriebs',
        'Vorabzustimmung der Bundesagentur für Arbeit, soweit erforderlich',
        'Deutschkenntnisse auf Niveau A2–B1 für die Verständigung in der Produktion',
        'Für Schweißer sind internationale Prüfbescheinigungen (z. B. ISO 9606) von Vorteil',
      ],
      en: [
        'A recognised vocational qualification (§18a) or university degree (§18b) – e.g. welder, machine operator, electrician',
        'A concrete job offer from a German industrial company that matches the qualification',
        'Pre-approval of the Federal Employment Agency (Vorabzustimmung) where required',
        'German at A2–B1 level for communication on the shop floor',
        'For welders, international certificates (e.g. ISO 9606) are an advantage',
      ],
      ru: [
        'Признанное профессиональное образование (§18a) или высшее образование (§18b) — например, сварщик, оператор станков, электрик',
        'Конкретное предложение о работе от немецкого промышленного предприятия, соответствующее квалификации',
        'Предварительное согласие Федерального агентства по труду (Vorabzustimmung), если требуется',
        'Немецкий на уровне A2–B1 для общения на производстве',
        'Для сварщиков преимуществом являются международные сертификаты (например, ISO 9606)',
      ],
    },
    documents: {
      az: [
        'Etibarlı xarici pasport',
        'Biometrik fotoşəkillər',
        'Doldurulmuş viza ərizə forması (VIDEX)',
        'Əmək müqaviləsi və ya iş təklifi',
        'Lazım olduqda ilkin razılıq (Vorabzustimmung) və iş münasibəti haqqında bəyannamə',
        'Tanınma qərarı (Anerkennungsbescheid) və ya tanınma prosedurunun sübutu',
        'Diplom, peşə sertifikatları və iş arayışları – təsdiqlənmiş tərcümə ilə',
        'Alman dilində tərcümeyi-hal (CV)',
        'Tibbi sığortanın sübutu',
      ],
      de: [
        'Gültiger Reisepass',
        'Biometrische Passfotos',
        'Ausgefüllter Visumantrag (VIDEX)',
        'Arbeitsvertrag oder verbindliches Arbeitsplatzangebot',
        'Vorabzustimmung und Erklärung zum Beschäftigungsverhältnis, soweit erforderlich',
        'Anerkennungsbescheid oder Nachweis über das laufende Anerkennungsverfahren',
        'Abschlüsse, Fachzertifikate und Arbeitszeugnisse mit beglaubigter Übersetzung',
        'Lebenslauf auf Deutsch',
        'Nachweis der Krankenversicherung',
      ],
      en: [
        'Valid passport',
        'Biometric photos',
        'Completed visa application form (VIDEX)',
        'Employment contract or binding job offer',
        'Pre-approval (Vorabzustimmung) and declaration of employment relationship where required',
        'Recognition notice (Anerkennungsbescheid) or proof of an ongoing recognition procedure',
        'Diplomas, trade certificates and references with certified translations',
        'CV in German',
        'Proof of health insurance',
      ],
      ru: [
        'Действующий заграничный паспорт',
        'Биометрические фотографии',
        'Заполненная визовая анкета (VIDEX)',
        'Трудовой договор или обязывающее предложение о работе',
        'Предварительное согласие (Vorabzustimmung) и декларация о трудовых отношениях, если требуется',
        'Решение о признании (Anerkennungsbescheid) или подтверждение текущей процедуры признания',
        'Дипломы, профессиональные сертификаты и рекомендации с заверенными переводами',
        'Резюме на немецком языке',
        'Подтверждение медицинской страховки',
      ],
    },
    faq: [
      {
        q: {
          az: 'Qaynaqçı sertifikatlarım Almaniyada qəbul olunurmu?',
          de: 'Werden meine Schweißerzertifikate in Deutschland anerkannt?',
          en: 'Are my welding certificates accepted in Germany?',
          ru: 'Принимаются ли мои сварочные сертификаты в Германии?',
        },
        a: {
          az: 'Beynəlxalq standartlar üzrə sertifikatlar (məs. ISO 9606) çox vaxt qəbul edilir, lakin işəgötürən praktiki sınaq və ya yenidən sertifikatlaşdırma tələb edə bilər. Peşə diplomunun özü isə viza üçün ayrıca tanınma prosedurundan keçməli ola bilər – bu, konkret haldan asılıdır.',
          de: 'Zertifikate nach internationalen Normen (z. B. ISO 9606) werden häufig akzeptiert, der Arbeitgeber kann jedoch eine Arbeitsprobe oder Nachprüfung verlangen. Der Berufsabschluss selbst muss für das Visum gegebenenfalls ein eigenes Anerkennungsverfahren durchlaufen – das hängt vom Einzelfall ab.',
          en: 'Certificates based on international standards (e.g. ISO 9606) are often accepted, but the employer may ask for a practical test or re-certification. The vocational diploma itself may need its own recognition procedure for the visa – this depends on the individual case.',
          ru: 'Сертификаты по международным стандартам (например, ISO 9606) часто принимаются, но работодатель может потребовать практическую пробу или переаттестацию. Сам диплом о профессиональном образовании может потребовать отдельной процедуры признания для визы — это зависит от конкретного случая.',
        },
      },
      faqFamily,
      faqSalary,
      faqSwitchEmployer,
    ],
  },
  {
    slug: 'ausbildung',
    germanLevel: 'B1',
    salaryMin: 1000, salaryMax: 1300,
    processingMin: 4, processingMax: 10,
    familyReunion: null,
    requirements: {
      az: [
        'Orta məktəb attestatı (peşədən asılı olaraq müəyyən qiymətlər tələb oluna bilər)',
        'Alman dili adətən B1 səviyyəsində (bəzi peşələr üçün A2 kifayət edə bilər)',
        'Alman şirkəti ilə imzalanmış təhsil müqaviləsi (Ausbildungsvertrag)',
        'Lazım olduqda Federal Məşğulluq Agentliyinin razılığı',
        'Tələb olunduqda, təhsil haqqı tələb olunan məbləğdən aşağıdırsa, maliyyə vəsaitinin sübutu',
      ],
      de: [
        'Schulabschluss (je nach Beruf können bestimmte Noten verlangt werden)',
        'Deutschkenntnisse in der Regel auf Niveau B1 (für manche Berufe kann A2 genügen)',
        'Unterschriebener Ausbildungsvertrag mit einem deutschen Betrieb',
        'Zustimmung der Bundesagentur für Arbeit, soweit erforderlich',
        'Nachweis der Lebensunterhaltssicherung, soweit erforderlich, wenn die Ausbildungsvergütung unter dem geforderten Betrag liegt',
      ],
      en: [
        'A school-leaving certificate (some professions may require certain grades)',
        'German usually at B1 level (A2 may be enough for some professions)',
        'A signed training contract (Ausbildungsvertrag) with a German company',
        'Approval of the Federal Employment Agency where required',
        'Proof of funds where required, if the training pay is below the required amount',
      ],
      ru: [
        'Аттестат о среднем образовании (для некоторых профессий могут требоваться определённые оценки)',
        'Немецкий, как правило, на уровне B1 (для некоторых профессий может хватить A2)',
        'Подписанный договор об обучении (Ausbildungsvertrag) с немецкой компанией',
        'Согласие Федерального агентства по труду, если оно требуется',
        'Подтверждение финансовых средств, если требуется, когда оплата обучения ниже необходимой суммы',
      ],
    },
    documents: {
      az: [
        'Etibarlı xarici pasport',
        'Biometrik fotoşəkillər',
        'Doldurulmuş viza ərizə forması (VIDEX)',
        'İmzalanmış təhsil müqaviləsi (Ausbildungsvertrag)',
        'Məktəb attestatı və qiymət cədvəli – təsdiqlənmiş tərcümə ilə',
        'Alman dili sertifikatı (adətən B1)',
        'Alman dilində tərcümeyi-hal (CV) və motivasiya məktubu',
        'Tələb olunduqda maliyyə vəsaitinin sübutu (məs. bloklanmış hesab)',
        'Tibbi sığortanın sübutu',
      ],
      de: [
        'Gültiger Reisepass',
        'Biometrische Passfotos',
        'Ausgefüllter Visumantrag (VIDEX)',
        'Unterschriebener Ausbildungsvertrag',
        'Schulabschlusszeugnis mit Notenübersicht und beglaubigter Übersetzung',
        'Deutsch-Sprachzertifikat (in der Regel B1)',
        'Lebenslauf und Motivationsschreiben auf Deutsch',
        'Finanzierungsnachweis (z. B. Sperrkonto), soweit erforderlich',
        'Nachweis der Krankenversicherung',
      ],
      en: [
        'Valid passport',
        'Biometric photos',
        'Completed visa application form (VIDEX)',
        'Signed training contract (Ausbildungsvertrag)',
        'School-leaving certificate and transcript with certified translation',
        'German language certificate (usually B1)',
        'CV and motivation letter in German',
        'Proof of funds (e.g. blocked account) where required',
        'Proof of health insurance',
      ],
      ru: [
        'Действующий заграничный паспорт',
        'Биометрические фотографии',
        'Заполненная визовая анкета (VIDEX)',
        'Подписанный договор об обучении (Ausbildungsvertrag)',
        'Аттестат и выписка оценок с заверенным переводом',
        'Сертификат по немецкому языку (обычно B1)',
        'Резюме и мотивационное письмо на немецком языке',
        'Подтверждение финансовых средств (например, блокированный счёт), если требуется',
        'Подтверждение медицинской страховки',
      ],
    },
    faq: [
      {
        q: {
          az: 'Ausbildung zamanı ailəmi gətirə bilərəmmi?',
          de: 'Kann ich während der Ausbildung meine Familie nachholen?',
          en: 'Can I bring my family during the Ausbildung?',
          ru: 'Можно ли перевезти семью во время обучения?',
        },
        a: {
          az: 'Yalnız bəzi hallarda. Təhsil haqqı adətən ailəni təmin etmək üçün kifayət etmir, ona görə də ailənin birləşdirilməsi gəlirdən, mənzildən və digər şərtlərdən asılıdır. Bu, hər bir hal üçün ayrıca yoxlanılmalıdır.',
          de: 'Nur in manchen Fällen. Die Ausbildungsvergütung reicht meist nicht aus, um eine Familie zu versorgen; der Familiennachzug hängt daher von Einkommen, Wohnraum und weiteren Voraussetzungen ab. Das muss im Einzelfall geprüft werden.',
          en: 'Only in some cases. Training pay is usually not enough to support a family, so family reunification depends on income, housing and other conditions. This has to be checked case by case.',
          ru: 'Только в отдельных случаях. Оплаты за обучение обычно недостаточно для содержания семьи, поэтому воссоединение зависит от дохода, жилья и других условий. Это проверяется индивидуально.',
        },
      },
      {
        q: {
          az: 'Gəlişdən əvvəl alman dilini bilməliyəmmi?',
          de: 'Muss ich vor der Einreise Deutsch können?',
          en: 'Do I need German before arrival?',
          ru: 'Нужно ли знать немецкий до приезда?',
        },
        a: {
          az: 'Bəli. Peşə məktəbində dərslər alman dilində keçir, ona görə də adətən B1 səviyyəsi gözlənilir. Bəzi işəgötürənlər və peşələr daha aşağı səviyyə ilə razılaşır – bu, konkret haldan asılıdır.',
          de: 'Ja. Der Unterricht an der Berufsschule findet auf Deutsch statt, daher wird in der Regel B1 erwartet. Manche Betriebe und Berufe akzeptieren ein niedrigeres Niveau – das hängt vom Einzelfall ab.',
          en: 'Yes. Classes at the vocational school are held in German, so B1 is usually expected. Some companies and professions accept a lower level – this depends on the individual case.',
          ru: 'Да. Занятия в профессиональной школе проходят на немецком, поэтому обычно ожидается уровень B1. Некоторые компании и профессии принимают более низкий уровень — это зависит от конкретного случая.',
        },
      },
      {
        q: {
          az: 'Təhsil zamanı maaş yaşamaq üçün kifayət edirmi?',
          de: 'Reicht die Ausbildungsvergütung zum Leben?',
          en: 'Is the training pay enough to live on?',
          ru: 'Хватит ли оплаты за обучение на жизнь?',
        },
        a: {
          az: 'Göstərilən aralıq təxminidir və peşədən, təhsil ilindən və regiondan asılıdır. Bəzi hallarda maaş tələb olunan məbləğdən aşağı olarsa, əlavə maliyyə vəsaitinin sübutu tələb oluna bilər. Biz hər bir halı ayrıca hesablayırıq.',
          de: 'Die angegebene Spanne ist unverbindlich und hängt vom Beruf, dem Ausbildungsjahr und der Region ab. Liegt die Vergütung unter dem geforderten Betrag, kann ein zusätzlicher Finanzierungsnachweis verlangt werden. Wir rechnen jeden Fall individuell durch.',
          en: 'The range shown is indicative and depends on the profession, the year of training and the region. If the pay is below the required amount, additional proof of funds may be requested. We calculate each case individually.',
          ru: 'Указанный диапазон ориентировочный и зависит от профессии, года обучения и региона. Если оплата ниже требуемой суммы, может понадобиться дополнительное подтверждение средств. Мы рассчитываем каждый случай индивидуально.',
        },
      },
      {
        q: {
          az: 'Təhsildən sonra Almaniyada qala bilərəmmi?',
          de: 'Kann ich nach der Ausbildung in Deutschland bleiben?',
          en: 'Can I stay in Germany after the Ausbildung?',
          ru: 'Можно ли остаться в Германии после обучения?',
        },
        a: {
          az: 'Bəli, uğurlu buraxılış imtahanından sonra ixtisaslı işçi kimi işləmək üçün yaşayış icazəsi almaq, bir qayda olaraq, mümkündür; iş axtarmaq üçün də müəyyən müddət verilə bilər. Dəqiq şərtlər fərdi vəziyyətdən asılıdır.',
          de: 'Ja, nach erfolgreichem Abschluss ist in der Regel eine Aufenthaltserlaubnis zur Beschäftigung als Fachkraft möglich; auch eine befristete Arbeitsplatzsuche kann erlaubt werden. Die genauen Bedingungen hängen vom Einzelfall ab.',
          en: 'Yes, after successfully completing the training a residence permit for employment as a skilled worker is generally possible, and a limited period to look for a job may also be granted. Exact conditions depend on the individual case.',
          ru: 'Да, после успешного окончания обучения, как правило, можно получить вид на жительство для работы квалифицированным специалистом; также может быть предоставлен срок для поиска работы. Точные условия зависят от конкретного случая.',
        },
      },
    ],
  },
  {
    slug: 'it-buero',
    germanLevel: 'B1',
    salaryMin: 3800, salaryMax: 5500,
    processingMin: 3, processingMax: 8,
    familyReunion: true,
    requirements: {
      az: [
        'Almaniyada tanınan və ya alman diplomu ilə müqayisə edilə bilən ali təhsil (anabin/ZAB)',
        'Mavi Kart üçün maaş qanuni minimum həddə cavab verməlidir',
        'İxtisasa uyğun konkret iş təklifi',
        'IT sahəsində alman dili çox vaxt tələb olunmur, ofis işləri üçün isə adətən lazımdır (B1 və yuxarı)',
        'Bəzi hallarda Federal Məşğulluq Agentliyinin razılığı',
      ],
      de: [
        'Hochschulabschluss, der in Deutschland anerkannt oder mit einem deutschen Abschluss vergleichbar ist (anabin/ZAB)',
        'Für die Blaue Karte EU muss das Gehalt die gesetzliche Mindestgrenze erreichen',
        'Konkretes Arbeitsplatzangebot, das zur Qualifikation passt',
        'In der IT oft keine Deutschkenntnisse erforderlich, für Bürotätigkeiten in der Regel schon (ab B1)',
        'In bestimmten Fällen Zustimmung der Bundesagentur für Arbeit',
      ],
      en: [
        'A university degree that is recognised in Germany or comparable to a German degree (anabin/ZAB)',
        'For the EU Blue Card the salary must meet the legal threshold',
        'A concrete job offer matching the qualification',
        'German is often not required in IT, but is usually needed for office jobs (B1 and above)',
        'Approval of the Federal Employment Agency in certain cases',
      ],
      ru: [
        'Высшее образование, признанное в Германии или сопоставимое с немецким дипломом (anabin/ZAB)',
        'Для Голубой карты ЕС зарплата должна соответствовать установленному законом порогу',
        'Конкретное предложение о работе, соответствующее квалификации',
        'В IT немецкий часто не требуется, а для офисной работы обычно нужен (от B1)',
        'В отдельных случаях — согласие Федерального агентства по труду',
      ],
    },
    documents: {
      az: [
        'Etibarlı xarici pasport',
        'Biometrik fotoşəkillər',
        'Doldurulmuş viza ərizə forması (VIDEX)',
        'Əmək müqaviləsi və ya iş təklifi (maaş göstərilməklə)',
        'Ali təhsil diplomu və əlavəsi – təsdiqlənmiş tərcümə ilə',
        'anabin çıxarışı və ya ZAB müqayisə arayışı (Zeugnisbewertung)',
        'Lazım olduqda iş münasibəti haqqında bəyannamə',
        'Alman və ya ingilis dilində tərcümeyi-hal (CV)',
        'Tibbi sığortanın sübutu',
      ],
      de: [
        'Gültiger Reisepass',
        'Biometrische Passfotos',
        'Ausgefüllter Visumantrag (VIDEX)',
        'Arbeitsvertrag oder Arbeitsplatzangebot mit Gehaltsangabe',
        'Hochschuldiplom mit Anlage und beglaubigter Übersetzung',
        'anabin-Ausdruck oder ZAB-Zeugnisbewertung',
        'Erklärung zum Beschäftigungsverhältnis, soweit erforderlich',
        'Lebenslauf auf Deutsch oder Englisch',
        'Nachweis der Krankenversicherung',
      ],
      en: [
        'Valid passport',
        'Biometric photos',
        'Completed visa application form (VIDEX)',
        'Employment contract or job offer stating the salary',
        'University diploma and transcript with certified translation',
        'anabin printout or ZAB statement of comparability (Zeugnisbewertung)',
        'Declaration of employment relationship where required',
        'CV in German or English',
        'Proof of health insurance',
      ],
      ru: [
        'Действующий заграничный паспорт',
        'Биометрические фотографии',
        'Заполненная визовая анкета (VIDEX)',
        'Трудовой договор или предложение о работе с указанием зарплаты',
        'Диплом о высшем образовании с приложением и заверенным переводом',
        'Распечатка из anabin или оценка диплома ZAB (Zeugnisbewertung)',
        'Декларация о трудовых отношениях, если требуется',
        'Резюме на немецком или английском языке',
        'Подтверждение медицинской страховки',
      ],
    },
    faq: [
      {
        q: {
          az: 'Alman dilini bilmədən işləyə bilərəmmi?',
          de: 'Kann ich ohne Deutschkenntnisse arbeiten?',
          en: 'Can I work without German?',
          ru: 'Можно ли работать без знания немецкого?',
        },
        a: {
          az: 'IT sahəsində bir çox komanda ingilis dilində işləyir və Mavi Kart üçün alman dili tələb olunmur. Mühasibat, inzibati iş və müştərilərlə işdə isə alman dili adətən vacibdir. Hər halda alman dili gündəlik həyatı və sonradan daimi yaşayış icazəsini asanlaşdırır.',
          de: 'In der IT arbeiten viele Teams auf Englisch, und für die Blaue Karte EU sind keine Deutschkenntnisse vorgeschrieben. In Buchhaltung, Verwaltung und Kundenkontakt ist Deutsch dagegen meist unverzichtbar. Deutsch erleichtert in jedem Fall den Alltag und später die Niederlassungserlaubnis.',
          en: 'In IT many teams work in English, and German is not a legal requirement for the EU Blue Card. In accounting, administration and customer-facing roles, however, German is usually essential. In any case, German makes daily life easier and helps later with permanent residence.',
          ru: 'В IT многие команды работают на английском, и для Голубой карты ЕС немецкий не обязателен. В бухгалтерии, администрировании и работе с клиентами немецкий, как правило, необходим. В любом случае немецкий облегчает повседневную жизнь и помогает позднее получить бессрочный ВНЖ.',
        },
      },
      {
        q: {
          az: 'Mavi Kart daimi yaşayışa necə aparır?',
          de: 'Wie führt die Blaue Karte EU zur Niederlassungserlaubnis?',
          en: 'How does the Blue Card lead to permanent residence?',
          ru: 'Как Голубая карта ведёт к бессрочному ВНЖ?',
        },
        a: {
          az: 'Mavi Kart sahibləri digər yaşayış icazələrinə nisbətən daha tez daimi yaşayış icazəsi (Niederlassungserlaubnis) ala bilərlər; alman dili biliyi bu müddəti daha da qısalda bilər. Dəqiq müddət və şərtlər qanunvericilikdən və fərdi vəziyyətdən asılıdır.',
          de: 'Inhaber der Blauen Karte EU können früher als bei anderen Aufenthaltstiteln eine Niederlassungserlaubnis erhalten; Deutschkenntnisse können diese Frist zusätzlich verkürzen. Genaue Fristen und Voraussetzungen hängen von der aktuellen Rechtslage und dem Einzelfall ab.',
          en: 'Blue Card holders can obtain a settlement permit (Niederlassungserlaubnis) sooner than with most other residence permits, and German skills can shorten this period further. Exact periods and conditions depend on current law and the individual case.',
          ru: 'Владельцы Голубой карты могут получить бессрочный вид на жительство (Niederlassungserlaubnis) быстрее, чем при большинстве других титулов, а знание немецкого может дополнительно сократить этот срок. Точные сроки и условия зависят от действующего законодательства и конкретного случая.',
        },
      },
      faqFamily,
      faqSalary,
    ],
  },
];

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const services: ServiceEnrichment[] = [
  {
    slug: 'candidate-selection',
    duration: { az: 'Qısa siyahıya qədər 2–4 həftə', de: '2–4 Wochen bis zur Shortlist', en: '2–4 weeks to shortlist', ru: '2–4 недели до шорт-листа' },
    steps: {
      az: [
        'Başlanğıc görüşü: vəzifə profilini, növbələri və maaş aralığını müəyyən edirik',
        'Bazamızdan və tərəfdaş peşə məktəblərindən uyğun namizədləri seçirik',
        'Sənədləri və iş təcrübəsini yoxlayırıq',
        'Praktiki bacarıq testi və onlayn müsahibə keçiririk',
        'Qısa siyahını təqdim edir və istəyinizlə video-müsahibələr təşkil edirik',
      ],
      de: [
        'Kick-off-Gespräch: Wir legen Stellenprofil, Schichten und Gehaltsrahmen fest',
        'Wir wählen passende Kandidaten aus unserem Pool und aus Partner-Berufsschulen aus',
        'Wir prüfen Unterlagen und Berufserfahrung',
        'Wir führen einen praktischen Kompetenztest und ein Online-Interview durch',
        'Sie erhalten die Shortlist; auf Wunsch organisieren wir Videointerviews',
      ],
      en: [
        'Kick-off call: we define the job profile, shifts and salary range',
        'We pre-select matching candidates from our pool and partner vocational schools',
        'We verify documents and work experience',
        'We run a practical skills test and an online interview',
        'You receive the shortlist, and we arrange video interviews on request',
      ],
      ru: [
        'Стартовый звонок: определяем профиль должности, смены и вилку зарплаты',
        'Отбираем подходящих кандидатов из нашей базы и партнёрских профшкол',
        'Проверяем документы и опыт работы',
        'Проводим практический тест навыков и онлайн-собеседование',
        'Вы получаете шорт-лист, по запросу организуем видеособеседования',
      ],
    },
  },
  {
    slug: 'documents',
    duration: { az: '1–3 həftə', de: '1–3 Wochen', en: '1–3 weeks', ru: '1–3 недели' },
    steps: {
      az: [
        'Viza növünüzə uyğun fərdi sənəd siyahısı hazırlayırıq',
        'Sənədləri onlayn kabinetinizə yükləyirsiniz',
        'Hər sənədi yoxlayır və lazım olduqda düzəliş tələb edirik',
        'Andlı tərcümə, notarial təsdiq və lazım olduqda apostil təşkil edirik',
        'Tam paketi viza və tanınma üçün hazır vəziyyətə gətiririk',
      ],
      de: [
        'Wir erstellen eine persönliche Dokumentenliste für Ihren Visumtyp',
        'Sie laden Ihre Unterlagen in Ihr Online-Konto hoch',
        'Wir prüfen jedes Dokument und fordern bei Bedarf Korrekturen an',
        'Wir organisieren beeidigte Übersetzung, Beglaubigung und, falls nötig, Apostille',
        'Wir stellen das vollständige Paket für Visum und Anerkennung bereit',
      ],
      en: [
        'We create a personal document checklist for your visa type',
        'You upload your documents to your online account',
        'We check every document and request corrections where needed',
        'We arrange sworn translation, certification and an apostille where needed',
        'We finalise the complete package for the visa and recognition',
      ],
      ru: [
        'Составляем персональный список документов для вашего типа визы',
        'Вы загружаете документы в личный онлайн-кабинет',
        'Проверяем каждый документ и при необходимости запрашиваем исправления',
        'Организуем присяжный перевод, заверение и при необходимости апостиль',
        'Готовим полный пакет для визы и признания',
      ],
    },
  },
  {
    slug: 'recognition',
    duration: { az: '2–4 ay (qurumdan asılıdır)', de: '2–4 Monate (abhängig von der Behörde)', en: '2–4 months (depends on the authority)', ru: '2–4 месяца (зависит от ведомства)' },
    steps: {
      az: [
        'İxtisasınızı anabin bazasında yoxlayırıq',
        'Səlahiyyətli qurumu müəyyən edirik (IHK FOSA, HWK, səhiyyə orqanı və ya ZAB)',
        'Ərizəni və tələb olunan sübutları hazırlayıb təqdim edirik',
        'Qurumla əlaqə saxlayır və əlavə sorğulara cavab veririk',
        'Qismən tanınma halında §16d yolunu – uyğunlaşma tədbiri və ya imtahanı planlaşdırırıq',
      ],
      de: [
        'Wir prüfen Ihren Abschluss in der anabin-Datenbank',
        'Wir ermitteln die zuständige Stelle (IHK FOSA, HWK, Gesundheitsbehörde oder ZAB)',
        'Wir bereiten den Antrag mit allen Nachweisen vor und reichen ihn ein',
        'Wir halten Kontakt zur Behörde und beantworten Nachforderungen',
        'Bei Teilanerkennung planen wir den Weg über §16d – Anpassungsmaßnahme oder Prüfung',
      ],
      en: [
        'We check your qualification in the anabin database',
        'We identify the competent authority (IHK FOSA, HWK, health authority or ZAB)',
        'We prepare and submit the application with all required evidence',
        'We stay in contact with the authority and answer follow-up requests',
        'If recognition is partial, we plan the §16d route – adaptation measure or exam',
      ],
      ru: [
        'Проверяем вашу квалификацию в базе anabin',
        'Определяем компетентное ведомство (IHK FOSA, HWK, орган здравоохранения или ZAB)',
        'Готовим и подаём заявление со всеми необходимыми подтверждениями',
        'Поддерживаем связь с ведомством и отвечаем на дополнительные запросы',
        'При частичном признании планируем путь по §16d — адаптационная мера или экзамен',
      ],
    },
  },
  {
    slug: 'visa-support',
    duration: { az: '4–12 həftə', de: '4–12 Wochen', en: '4–12 weeks', ru: '4–12 недель' },
    steps: {
      az: [
        'Namizədin vəziyyətinə uyğun viza yolunu seçirik',
        'İşəgötürənlə birlikdə Federal Məşğulluq Agentliyindən ilkin razılıq və ya lazım olduqda sürətləndirilmiş prosedur (§81a) üçün müraciət edirik',
        'Səfirlik üçün sənəd paketini tərtib edir və görüş təyin edirik',
        'Namizədi səfirlikdəki müsahibəyə hazırlayırıq',
        'Qərara qədər statusu izləyir və hər dəyişiklik barədə məlumat veririk',
      ],
      de: [
        'Wir wählen den passenden Visumweg für die Situation des Kandidaten',
        'Gemeinsam mit dem Arbeitgeber beantragen wir die Vorabzustimmung oder, wo sinnvoll, das beschleunigte Fachkräfteverfahren (§81a)',
        'Wir stellen die Unterlagen für die Botschaft zusammen und buchen den Termin',
        'Wir bereiten den Kandidaten auf das Gespräch in der Botschaft vor',
        'Wir verfolgen den Status bis zur Entscheidung und informieren Sie über jede Änderung',
      ],
      en: [
        'We choose the right visa route for the candidate’s situation',
        'Together with the employer we apply for pre-approval or, where useful, the fast-track procedure (§81a)',
        'We compile the embassy document package and book the appointment',
        'We prepare the candidate for the embassy interview',
        'We track the status until the decision and notify you of every change',
      ],
      ru: [
        'Выбираем подходящий визовый путь с учётом ситуации кандидата',
        'Вместе с работодателем подаём на предварительное согласие или, где это целесообразно, на ускоренную процедуру (§81a)',
        'Собираем пакет документов для посольства и записываемся на приём',
        'Готовим кандидата к собеседованию в посольстве',
        'Отслеживаем статус до решения и сообщаем о каждом изменении',
      ],
    },
  },
  {
    slug: 'german-courses',
    duration: { az: 'Hər səviyyə üçün təxminən 2–3 ay', de: 'ca. 2–3 Monate pro Niveau', en: 'about 2–3 months per level', ru: 'около 2–3 месяцев на уровень' },
    steps: {
      az: [
        'Səviyyə testi ilə hazırkı biliyinizi müəyyən edirik',
        'Hədəf səviyyəyə və viza tələbinə uyğun fərdi plan qururuq',
        'Bakıda və ya onlayn intensiv qrupda dərslərə başlayırsınız',
        'Peşəyə yönəlmiş lüğət və real iş situasiyaları üzərində çalışırıq',
        'Sınaq imtahanları keçirir və Goethe, telc və ya ÖSD imtahanına qeydiyyata kömək edirik',
      ],
      de: [
        'Ein Einstufungstest ermittelt Ihr aktuelles Niveau',
        'Wir erstellen einen Lernplan passend zum Zielniveau und zur Visumanforderung',
        'Sie starten in einer Intensivgruppe in Baku oder online',
        'Wir trainieren berufsbezogenen Wortschatz und typische Situationen am Arbeitsplatz',
        'Wir führen Probeprüfungen durch und helfen bei der Anmeldung zu Goethe, telc oder ÖSD',
      ],
      en: [
        'A placement test determines your current level',
        'We build a study plan matched to your target level and visa requirement',
        'You start in an intensive group in Baku or online',
        'We train job-specific vocabulary and typical workplace situations',
        'We run mock exams and help you register for Goethe, telc or ÖSD',
      ],
      ru: [
        'Вступительный тест определяет ваш текущий уровень',
        'Составляем учебный план под целевой уровень и визовые требования',
        'Вы начинаете занятия в интенсивной группе в Баку или онлайн',
        'Отрабатываем профессиональную лексику и типичные рабочие ситуации',
        'Проводим пробные экзамены и помогаем записаться на Goethe, telc или ÖSD',
      ],
    },
  },
  {
    slug: 'arrival-integration',
    duration: { az: 'Gəlişdən sonrakı ilk 1–3 ay', de: 'die ersten 1–3 Monate nach der Ankunft', en: 'first 1–3 months after arrival', ru: 'первые 1–3 месяца после приезда' },
    steps: {
      az: [
        'Uçuşu planlaşdırır və işin başlanğıc tarixi ilə uzlaşdırırıq',
        'Sizi hava limanında qarşılayır və mənzilə aparırıq',
        'Ünvan qeydiyyatı (Anmeldung) və Əcnəbilər idarəsinə müraciətdə müşayiət edirik',
        'Bank hesabı, vergi nömrəsi və tibbi sığortanın açılmasına kömək edirik',
        'İlk aylarda işçi və işəgötürən üçün sabit əlaqə şəxsi oluruq',
      ],
      de: [
        'Wir planen den Flug abgestimmt auf den Arbeitsbeginn',
        'Wir holen Sie am Flughafen ab und bringen Sie zur Unterkunft',
        'Wir begleiten Sie zur Anmeldung und zur Ausländerbehörde',
        'Wir unterstützen bei Bankkonto, Steuer-ID und Krankenversicherung',
        'In den ersten Monaten sind wir feste Ansprechpartner für Mitarbeiter und Arbeitgeber',
      ],
      en: [
        'We plan the flight around the job start date',
        'We pick you up at the airport and take you to your accommodation',
        'We accompany you to address registration (Anmeldung) and the foreigners’ authority',
        'We help with the bank account, tax ID and health insurance',
        'During the first months we remain the contact person for employee and employer',
      ],
      ru: [
        'Планируем перелёт с учётом даты начала работы',
        'Встречаем вас в аэропорту и отвозим к жилью',
        'Сопровождаем при регистрации по месту жительства (Anmeldung) и в ведомстве по делам иностранцев',
        'Помогаем открыть банковский счёт, получить налоговый номер и медицинскую страховку',
        'В первые месяцы остаёмся контактным лицом для работника и работодателя',
      ],
    },
  },
  {
    slug: 'employer-services',
    duration: { az: 'Davamlı, layihə üzrə', de: 'laufend, projektbezogen', en: 'ongoing, per project', ru: 'постоянно, в рамках проекта' },
    steps: {
      az: [
        'Kadr ehtiyacınızı, həcmi və vaxt cədvəlini birlikdə təhlil edirik',
        'Sizə ayrıca hesab meneceri təyin edirik',
        'Federal Məşğulluq Agentliyi üçün vəzifə təsviri və əmək müqaviləsini hazırlamağa kömək edirik',
        'Namizədlərin seçimini və viza prosesini paralel idarə edir, müntəzəm hesabat veririk',
        'İşə uyğunlaşma proqramı ilə işçilərin uzunmüddətli qalmasını dəstəkləyirik',
      ],
      de: [
        'Wir analysieren gemeinsam Personalbedarf, Umfang und Zeitplan',
        'Sie erhalten einen festen Account Manager',
        'Wir unterstützen bei Stellenbeschreibung für die Bundesagentur für Arbeit und Arbeitsvertrag',
        'Wir steuern Auswahl und Visumverfahren parallel und berichten regelmäßig',
        'Mit einem Onboarding-Programm fördern wir die langfristige Bindung',
      ],
      en: [
        'We jointly analyse your staffing needs, volume and timeline',
        'You are assigned a dedicated account manager',
        'We help with the job description for the Federal Employment Agency and the employment contract',
        'We run selection and visa procedures in parallel and report regularly',
        'An onboarding programme supports long-term retention',
      ],
      ru: [
        'Вместе анализируем потребность в персонале, объём и сроки',
        'Вам назначается персональный аккаунт-менеджер',
        'Помогаем с описанием вакансии для Федерального агентства по труду и трудовым договором',
        'Параллельно ведём отбор и визовые процедуры и регулярно отчитываемся',
        'Программа адаптации помогает удержать сотрудников надолго',
      ],
    },
  },
  {
    slug: 'ausbildung-placement',
    duration: { az: 'Təhsilin başlanmasından 3–9 ay əvvəl', de: '3–9 Monate vor Ausbildungsbeginn', en: '3–9 months before training start', ru: 'за 3–9 месяцев до начала обучения' },
    steps: {
      az: [
        'Peşə yönümü: maraqlarınıza və dil səviyyənizə uyğun peşə seçirik',
        'Alman dilində CV və motivasiya məktubu hazırlayırıq',
        'Uyğun şirkətlərə müraciət edir və müsahibələrə hazırlaşdırırıq',
        'Təhsil müqaviləsi imzalandıqdan sonra §16a vizası üçün müraciət edirik',
        'Yaşayış yeri və peşə məktəbinə qeydiyyatı təşkil edirik',
      ],
      de: [
        'Berufsorientierung: Wir wählen einen Beruf passend zu Interessen und Sprachniveau',
        'Wir erstellen Lebenslauf und Motivationsschreiben auf Deutsch',
        'Wir bewerben Sie bei passenden Betrieben und bereiten Sie auf Gespräche vor',
        'Nach Unterzeichnung des Ausbildungsvertrags beantragen wir das Visum nach §16a',
        'Wir organisieren Unterkunft und Anmeldung an der Berufsschule',
      ],
      en: [
        'Career guidance: we choose a profession matching your interests and language level',
        'We prepare your CV and motivation letter in German',
        'We apply to suitable companies and prepare you for interviews',
        'Once the training contract is signed, we apply for the §16a visa',
        'We arrange accommodation and vocational school enrolment',
      ],
      ru: [
        'Профориентация: подбираем профессию с учётом интересов и уровня языка',
        'Готовим резюме и мотивационное письмо на немецком',
        'Отправляем заявки в подходящие компании и готовим к собеседованиям',
        'После подписания договора об обучении подаём на визу по §16a',
        'Организуем жильё и зачисление в профессиональную школу',
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Validation: every L10nList must have the same number of items per language
// ---------------------------------------------------------------------------

function assertList(label: string, list: L10nList) {
  const n = list.en.length;
  for (const lang of ['az', 'de', 'ru'] as const) {
    if (list[lang].length !== n) {
      throw new Error(`${label}: "${lang}" has ${list[lang].length} items, "en" has ${n}`);
    }
  }
}

function validate() {
  for (const v of visas) {
    assertList(`visa ${v.slug} requirements`, v.requirements);
    assertList(`visa ${v.slug} documents`, v.documents);
  }
  for (const s of services) assertList(`service ${s.slug} steps`, s.steps);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  validate();

  let visasUpdated = 0;
  let servicesUpdated = 0;

  for (const v of visas) {
    const exists = await prisma.visaCategory.findUnique({ where: { slug: v.slug }, select: { id: true } });
    if (!exists) {
      console.warn(`skip visa ${v.slug}: not found`);
      continue;
    }
    const { slug, ...data } = v;
    await prisma.visaCategory.update({ where: { slug }, data });
    console.log(`updated visa ${slug}`);
    visasUpdated++;
  }

  for (const s of services) {
    const exists = await prisma.service.findUnique({ where: { slug: s.slug }, select: { id: true } });
    if (!exists) {
      console.warn(`skip service ${s.slug}: not found`);
      continue;
    }
    const { slug, ...data } = s;
    await prisma.service.update({ where: { slug }, data });
    console.log(`updated service ${slug}`);
    servicesUpdated++;
  }

  console.log(`done: ${visasUpdated}/${visas.length} visas, ${servicesUpdated}/${services.length} services updated`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

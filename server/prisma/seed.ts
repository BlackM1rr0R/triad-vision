import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { services } from './seedServices';
import { seedRequirements } from './seed/requirements';
import { seedJourney } from './seed/journey';
import { seedContractTemplates } from './seed/contractTemplates';
import { seedInterviewPrep } from './seed/interviewPrep';
import { seedGuideCalculators, seedGuides } from './seed/guides/index';

/**
 * SEED_PROFILE (white-label, deploy/whitelabel/README.md):
 *   owner       (default) the owner's Triad Vision site: super admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD and
 *               the full starter content (testimonials, stats, sample visas, partner logos, posts, contact data).
 *   whitelabel  a customer agency's instance: no Triad Vision business content (no testimonials, statistics,
 *               sample visas, partner logos, news posts, contact / social data); the generic starter content
 *               (visa categories, services, FAQ, requirements, journey, contract template, interview prep, guides)
 *               is written with "Triad Vision" replaced by BRAND_NAME. The first SUPER_ADMIN (SEED_ADMIN_EMAIL)
 *               gets a one-time setup link instead of a password from the environment.
 */
const SEED_PROFILE = (process.env.SEED_PROFILE ?? 'owner').trim().toLowerCase();
if (SEED_PROFILE !== 'owner' && SEED_PROFILE !== 'whitelabel') throw new Error(`Unknown SEED_PROFILE "${SEED_PROFILE}" (owner | whitelabel)`);
const WHITELABEL = SEED_PROFILE === 'whitelabel';
const BRAND_NAME = (process.env.BRAND_NAME ?? '').trim() || 'Triad Vision';

/** "Triad Vision" in seeded texts → the instance brand (whitelabel profile only). */
const brandDeep = (v: unknown): unknown => {
  if (typeof v === 'string') return v.split('Triad Vision').join(BRAND_NAME).split('TRIAD VISION').join(BRAND_NAME.toLocaleUpperCase('en'));
  if (Array.isArray(v)) return v.map(brandDeep);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, brandDeep(x)]));
  return v;
};
const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert']);
const basePrisma = new PrismaClient();
const prisma: PrismaClient =
  WHITELABEL && BRAND_NAME !== 'Triad Vision'
    ? (basePrisma.$extends({
        query: {
          $allModels: {
            async $allOperations({ operation, args, query }) {
              return query(WRITE_OPS.has(operation) ? (brandDeep(args) as typeof args) : args);
            },
          },
        },
      }) as unknown as PrismaClient)
    : basePrisma;
const img = (id: string, w = 1200) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=75`;

type L = { az: string; de: string; en: string; ru: string };
type LL = { az: string[]; de: string[]; en: string[]; ru: string[] };

const visaCategories: {
  slug: string; icon: string; image: string; visaLabel: string; title: L; summary: L; items: LL; body: L;
}[] = [
  {
    slug: 'lkw-fahrer', icon: 'Truck', image: img('1601584115197-04ecc0da31d7'), visaLabel: '§19c',
    title: { az: 'LKW sürücüləri', de: 'LKW-Fahrer', en: 'Truck drivers', ru: 'Водители грузовиков' },
    summary: {
      az: 'C/CE kateqoriyalı peşəkar sürücülər üçün Almaniyada uzunmüddətli iş və viza.',
      de: 'Langfristige Anstellung und Visum für Berufskraftfahrer mit Klasse C/CE.',
      en: 'Long-term employment and visa for professional C/CE drivers.',
      ru: 'Долгосрочное трудоустройство и виза для профессиональных водителей категории C/CE.',
    },
    items: {
      az: ['Berufskraftfahrer (CE)', 'Uzaq və yaxın məsafə daşımaları', 'Ekspeditor və logistika', 'Uzunmüddətli əmək müqaviləsi'],
      de: ['Berufskraftfahrer (CE)', 'Fern- und Nahverkehr', 'Spedition und Logistik', 'Langfristige Anstellung'],
      en: ['Professional drivers (CE)', 'Long-haul and regional transport', 'Forwarding and logistics', 'Long-term contracts'],
      ru: ['Профессиональные водители (CE)', 'Дальние и местные перевозки', 'Экспедирование и логистика', 'Долгосрочный контракт'],
    },
    body: {
      az: 'Almaniyada logistika sektoru ən çox işçi qüvvəsinə ehtiyac duyan sahələrdən biridir. Biz C/CE kateqoriyalı təcrübəli sürücüləri tərəfdaş ekspeditor şirkətlərlə birləşdiririk.\n\nProses sürücülük vəsiqəsinin Almaniya standartlarına uyğunlaşdırılması (Führerscheinumschreibung), kod 95 (Berufskraftfahrerqualifikation) və işəgötürənlə müqavilə daxil olmaqla tam şəkildə müşayiət olunur.',
      de: 'Die Logistikbranche gehört zu den Bereichen mit dem größten Fachkräftebedarf in Deutschland. Wir verbinden erfahrene C/CE-Fahrer mit unseren Partnerspeditionen.\n\nWir begleiten den gesamten Prozess – inklusive Führerscheinumschreibung, Schlüsselzahl 95 (Berufskraftfahrerqualifikation) und Arbeitsvertrag.',
      en: 'Logistics is one of the sectors with the highest labour demand in Germany. We match experienced C/CE drivers with our partner forwarding companies.\n\nWe support the whole process, including licence conversion, code 95 (driver qualification) and the employment contract.',
      ru: 'Логистика — одна из отраслей Германии с наибольшей потребностью в кадрах. Мы связываем опытных водителей категории C/CE с нашими партнёрами-экспедиторами.\n\nМы сопровождаем весь процесс, включая замену водительского удостоверения, код 95 и трудовой договор.',
    },
  },
  {
    slug: 'kurierfahrer', icon: 'Package', image: img('1566576721346-d4a3b4eaeb55'), visaLabel: '§18b',
    title: { az: 'Kuryer sürücüləri', de: 'Kurierfahrer', en: 'Courier drivers', ru: 'Курьеры-водители' },
    summary: {
      az: 'Bağlama çatdırılması və şəhərdaxili daşımalar üçün B kateqoriyalı sürücülər.',
      de: 'Fahrer mit Klasse B für Paketzustellung und Stadtverkehr.',
      en: 'Category B drivers for parcel delivery and urban transport.',
      ru: 'Водители категории B для доставки посылок и городских перевозок.',
    },
    items: {
      az: ['Bağlama çatdırılması', 'Şəhər və regional marşrutlar', 'DPD, DHL, GLS və s.', 'Tam və yarım ştat'],
      de: ['Paketzustellung', 'Stadt- und Landverkehr', 'DPD, DHL, GLS u.a.', 'Vollzeit und Teilzeit'],
      en: ['Parcel delivery', 'City and regional routes', 'DPD, DHL, GLS and others', 'Full-time and part-time'],
      ru: ['Доставка посылок', 'Городские и региональные маршруты', 'DPD, DHL, GLS и др.', 'Полная и частичная занятость'],
    },
    body: {
      az: 'Onlayn ticarətin sürətli inkişafı ilə Almaniyada kuryer sürücülərinə tələbat davamlı artır. Tərəfdaşlarımız sabit maaş, iş avtomobili və təlim təklif edir.\n\nNamizədin seçimindən işə başlamasına qədər bütün sənədləşmə prosesini biz idarə edirik.',
      de: 'Durch das Wachstum des Onlinehandels steigt der Bedarf an Kurierfahrern in Deutschland stetig. Unsere Partner bieten festes Gehalt, Firmenfahrzeug und Einarbeitung.\n\nWir übernehmen die komplette Abwicklung – von der Auswahl bis zum ersten Arbeitstag.',
      en: 'With the growth of e-commerce, demand for courier drivers in Germany keeps rising. Our partners offer a fixed salary, a company vehicle and onboarding.\n\nWe manage all paperwork, from selection to the first working day.',
      ru: 'С ростом онлайн-торговли спрос на курьеров в Германии постоянно растёт. Наши партнёры предлагают стабильную зарплату, служебный автомобиль и обучение.\n\nМы берём на себя всё оформление — от отбора до первого рабочего дня.',
    },
  },
  {
    slug: 'gastronomie-hotel', icon: 'ChefHat', image: img('1577219491135-ce391730fb2c'), visaLabel: '§18b',
    title: { az: 'Aşpazlıq və otel', de: 'Gastronomie & Hotel', en: 'Hospitality & hotels', ru: 'Гастрономия и отели' },
    summary: {
      az: 'Restoran, otel və iaşə müəssisələri üçün aşpaz və xidmət işçiləri.',
      de: 'Köche und Servicekräfte für Restaurants, Hotels und Catering.',
      en: 'Chefs and service staff for restaurants, hotels and catering.',
      ru: 'Повара и обслуживающий персонал для ресторанов, отелей и кейтеринга.',
    },
    items: {
      az: ['Aşpaz, mətbəx köməkçisi', 'Ofisiant, restoran xidməti', 'Otel resepsiyası', 'Mövsümi və illik iş yerləri'],
      de: ['Koch, Küchenhilfe', 'Servicekraft, Restaurant', 'Hotelrezeption', 'Saison- und Ganzjahresstellen'],
      en: ['Chef, kitchen assistant', 'Waiting staff', 'Hotel reception', 'Seasonal and year-round jobs'],
      ru: ['Повар, помощник повара', 'Официант', 'Ресепшен отеля', 'Сезонная и круглогодичная работа'],
    },
    body: {
      az: 'Almaniyanın turizm və restoran sektoru peşəkar kadrlara böyük ehtiyac duyur. Biz təcrübəli aşpaz və xidmət personalını etibarlı işəgötürənlərlə birləşdiririk.\n\nYaşayış yeri axtarışı və inteqrasiya ilə bağlı da dəstək göstəririk.',
      de: 'Die deutsche Gastronomie- und Hotelbranche sucht dringend Fachpersonal. Wir vermitteln erfahrene Köche und Servicekräfte an zuverlässige Arbeitgeber.\n\nAuch bei Wohnungssuche und Integration unterstützen wir.',
      en: "Germany's hospitality sector urgently needs skilled staff. We place experienced chefs and service staff with reliable employers.\n\nWe also help with housing and integration.",
      ru: 'Гостиничный и ресторанный сектор Германии остро нуждается в кадрах. Мы трудоустраиваем опытных поваров и персонал у надёжных работодателей.\n\nТакже помогаем с жильём и интеграцией.',
    },
  },
  {
    slug: 'bau-handwerk', icon: 'HardHat', image: img('1504307651254-35680f356dfd'), visaLabel: '§18a',
    title: { az: 'Tikinti və sənətkarlıq', de: 'Bau & Handwerk', en: 'Construction & trades', ru: 'Строительство и ремёсла' },
    summary: {
      az: 'Tikinti, elektrik, quraşdırma və digər sənətkarlıq peşələri.',
      de: 'Bau, Elektro, Installation und weitere Handwerksberufe.',
      en: 'Construction, electrical, installation and other skilled trades.',
      ru: 'Строительство, электрика, монтаж и другие рабочие профессии.',
    },
    items: {
      az: ['Tikinti işçiləri, ustalar', 'Elektrik, santexnik', 'Rəngsaz, kafelçi', 'Dam ustası və s.'],
      de: ['Bauhelfer, Fachkräfte', 'Elektriker, Installateure', 'Maler, Fliesenleger', 'Dachdecker u.v.m.'],
      en: ['Construction workers', 'Electricians, plumbers', 'Painters, tilers', 'Roofers and more'],
      ru: ['Строители, мастера', 'Электрики, сантехники', 'Маляры, плиточники', 'Кровельщики и др.'],
    },
    body: {
      az: 'Almaniyada tikinti sektorunda ixtisaslı işçi çatışmazlığı davam edir. Peşə təhsili və ya təcrübəsi olan namizədlər üçün diplomun tanınması (Anerkennung) prosesini də təşkil edirik.\n\nTəhlükəsizlik təlimləri və işəgötürənlə uyğunlaşma prosesində sizi müşayiət edirik.',
      de: 'Im deutschen Baugewerbe herrscht anhaltender Fachkräftemangel. Für Bewerber mit Ausbildung oder Erfahrung organisieren wir auch die Anerkennung der Qualifikation.\n\nWir begleiten bei Sicherheitsunterweisungen und der Einarbeitung beim Arbeitgeber.',
      en: "Germany's construction sector has a persistent skills shortage. For candidates with training or experience we also organise recognition of qualifications.\n\nWe support safety training and onboarding with the employer.",
      ru: 'В строительной отрасли Германии сохраняется нехватка специалистов. Для кандидатов с образованием или опытом мы также организуем признание квалификации.\n\nСопровождаем инструктаж по технике безопасности и адаптацию у работодателя.',
    },
  },
  {
    slug: 'pflege-gesundheit', icon: 'HeartPulse', image: img('1576765608535-5f04d1e3f289'), visaLabel: '§16a / §16d',
    title: { az: 'Tibb və qayğı', de: 'Pflege & Gesundheit', en: 'Nursing & healthcare', ru: 'Уход и здравоохранение' },
    summary: {
      az: 'Tibb bacıları, qayğı işçiləri və Ausbildung proqramları.',
      de: 'Pflegefachkräfte, Pflegehelfer und Ausbildungsprogramme.',
      en: 'Nurses, care assistants and vocational training programmes.',
      ru: 'Медсёстры, сиделки и программы профобучения.',
    },
    items: {
      az: ['Tibb bacısı (Ausbildung)', 'Qayğı köməkçisi', 'Yaşlılara qulluq', 'Digər səhiyyə peşələri'],
      de: ['Pflegefachkraft (Ausbildung)', 'Krankenpflegehelfer', 'Altenpflege', 'Weitere Gesundheitsberufe'],
      en: ['Nurse (vocational training)', 'Nursing assistant', 'Elderly care', 'Other healthcare jobs'],
      ru: ['Медсестра (Ausbildung)', 'Помощник медсестры', 'Уход за пожилыми', 'Другие медицинские профессии'],
    },
    body: {
      az: 'Səhiyyə Almaniyada ən perspektivli sahələrdən biridir. Diplomlu tibb bacıları üçün tanınma (§16d), gənclər üçün isə maaşlı peşə təhsili (Ausbildung, §16a) proqramları təklif edirik.\n\nAlman dili kursları (B1/B2) və imtahana hazırlıqda da dəstək veririk.',
      de: 'Die Pflege ist einer der zukunftssichersten Bereiche in Deutschland. Für ausgebildete Pflegekräfte bieten wir Anerkennungsverfahren (§16d), für junge Menschen eine vergütete Ausbildung (§16a).\n\nWir unterstützen auch bei Deutschkursen (B1/B2) und der Prüfungsvorbereitung.',
      en: 'Healthcare is one of the most secure career paths in Germany. We offer recognition procedures (§16d) for qualified nurses and paid vocational training (§16a) for young people.\n\nWe also help with German courses (B1/B2) and exam preparation.',
      ru: 'Здравоохранение — одна из самых перспективных сфер в Германии. Для дипломированных медсестёр — признание квалификации (§16d), для молодёжи — оплачиваемое профобучение (§16a).\n\nПомогаем с курсами немецкого (B1/B2) и подготовкой к экзаменам.',
    },
  },
  {
    slug: 'landwirtschaft', icon: 'Sprout', image: img('1625246333195-78d9c38ad449'), visaLabel: 'Saisonarbeit',
    title: { az: 'Kənd təsərrüfatı', de: 'Landwirtschaft', en: 'Agriculture', ru: 'Сельское хозяйство' },
    summary: {
      az: 'Məhsul yığımı və mövsümi kənd təsərrüfatı işləri.',
      de: 'Ernte und saisonale Arbeit in der Landwirtschaft.',
      en: 'Harvesting and seasonal agricultural work.',
      ru: 'Сбор урожая и сезонные сельхозработы.',
    },
    items: {
      az: ['Məhsul yığımı', 'Meyvə və tərəvəz yığımı', 'Mövsümi məşğulluq', 'Yaşayış yeri təmin olunur'],
      de: ['Erntehelfer', 'Obst- und Gemüseernte', 'Saisonale Beschäftigung', 'Unterkunft wird gestellt'],
      en: ['Harvest helpers', 'Fruit and vegetable picking', 'Seasonal employment', 'Accommodation provided'],
      ru: ['Сбор урожая', 'Сбор фруктов и овощей', 'Сезонная занятость', 'Жильё предоставляется'],
    },
    body: {
      az: 'Mövsümi iş proqramı çərçivəsində ildə 8 aya qədər Almaniyada kənd təsərrüfatı təsərrüfatlarında işləmək mümkündür.\n\nAdətən işəgötürən yaşayış yeri təmin edir. Proses qısa və şəffafdır.',
      de: 'Im Rahmen der Saisonbeschäftigung kann bis zu 8 Monate im Jahr in deutschen Landwirtschaftsbetrieben gearbeitet werden.\n\nDie Unterkunft wird in der Regel vom Arbeitgeber gestellt. Der Prozess ist kurz und transparent.',
      en: 'Under the seasonal work programme you can work on German farms for up to 8 months a year.\n\nAccommodation is usually provided by the employer. The process is short and transparent.',
      ru: 'В рамках программы сезонной работы можно работать на фермах Германии до 8 месяцев в году.\n\nЖильё обычно предоставляет работодатель. Процесс короткий и прозрачный.',
    },
  },
  {
    slug: 'industrie-technik', icon: 'Factory', image: img('1504328345606-18bbc8c9d7d1'), visaLabel: '§18a',
    title: { az: 'İstehsalat və texniki sahələr', de: 'Industrie & Technik', en: 'Industry & technical', ru: 'Производство и техника' },
    summary: {
      az: 'Qaynaqçılar, operatorlar, metal və elektrik sahəsi mütəxəssisləri.',
      de: 'Schweißer, Maschinenbediener, Metall- und Elektrofachkräfte.',
      en: 'Welders, machine operators, metal and electrical specialists.',
      ru: 'Сварщики, операторы станков, специалисты по металлу и электрике.',
    },
    items: {
      az: ['Maşınçı və operator', 'Metal və elektrik sahəsi', 'Qaynaqçı (Schweißer)', 'Quraşdırma və montaj'],
      de: ['Maschinen- und Anlagenführer', 'Metall- und Elektrotechnik', 'Schweißer', 'Montage und Installation'],
      en: ['Machine operators', 'Metal and electrical engineering', 'Welders', 'Assembly and installation'],
      ru: ['Операторы станков', 'Металл и электротехника', 'Сварщики', 'Монтаж и установка'],
    },
    body: {
      az: 'Alman sənayesi dünyanın ən güclülərindəndir və texniki mütəxəssislərə daim ehtiyac var. Sertifikatlı qaynaqçılar və operatorlar üçün yüksək maaşlı vakansiyalar təklif edirik.\n\nLazım gəldikdə sertifikatların tanınması prosesini də təşkil edirik.',
      de: 'Die deutsche Industrie gehört zu den stärksten der Welt und braucht ständig technische Fachkräfte. Für zertifizierte Schweißer und Bediener bieten wir gut bezahlte Stellen.\n\nBei Bedarf organisieren wir auch die Anerkennung von Zertifikaten.',
      en: 'German industry is among the strongest in the world and constantly needs technical specialists. We offer well-paid jobs for certified welders and operators.\n\nIf needed we also organise recognition of certificates.',
      ru: 'Немецкая промышленность — одна из сильнейших в мире, ей постоянно нужны технические специалисты. Предлагаем высокооплачиваемые вакансии для сертифицированных сварщиков и операторов.\n\nПри необходимости организуем признание сертификатов.',
    },
  },
  {
    slug: 'ausbildung', icon: 'GraduationCap', image: img('1522202176988-66273c2fd55f'), visaLabel: '§16a',
    title: { az: 'Peşə təhsili (Ausbildung)', de: 'Ausbildung', en: 'Vocational training', ru: 'Профобучение (Ausbildung)' },
    summary: {
      az: 'Almaniyada maaşlı peşə təhsili: oxu və eyni zamanda işlə.',
      de: 'Vergütete Berufsausbildung in Deutschland: lernen und gleichzeitig verdienen.',
      en: 'Paid vocational training in Germany: learn and earn at the same time.',
      ru: 'Оплачиваемое профобучение в Германии: учись и зарабатывай.',
    },
    items: {
      az: ['Tibb, texnika, logistika', 'Aylıq təqaüd', '2–3,5 il müddət', 'Sonra daimi iş imkanı'],
      de: ['Pflege, Technik, Logistik', 'Monatliche Vergütung', 'Dauer 2–3,5 Jahre', 'Danach Festanstellung möglich'],
      en: ['Healthcare, technical, logistics', 'Monthly salary', '2–3.5 years', 'Permanent job afterwards'],
      ru: ['Медицина, техника, логистика', 'Ежемесячная стипендия', '2–3,5 года', 'Затем постоянная работа'],
    },
    body: {
      az: 'Ausbildung — Almaniyanın dual təhsil sistemidir: həftənin bir hissəsi məktəbdə, qalanı müəssisədə keçir və hər ay maaş ödənilir.\n\nBiz uyğun Ausbildung yerinin tapılmasından, dil hazırlığından və viza prosesindən tutmuş, gəlişə qədər bütün mərhələlərdə yanınızdayıq.',
      de: 'Die Ausbildung ist das duale System Deutschlands: ein Teil der Woche in der Berufsschule, der Rest im Betrieb – mit monatlicher Vergütung.\n\nWir begleiten Sie von der Suche nach dem passenden Ausbildungsplatz über die Sprachvorbereitung und das Visum bis zur Einreise.',
      en: "Ausbildung is Germany's dual training system: part of the week at vocational school, the rest at the company, with a monthly salary.\n\nWe support you from finding the right placement, through language preparation and the visa, to your arrival.",
      ru: 'Ausbildung — дуальная система обучения в Германии: часть недели в профшколе, остальное на предприятии, с ежемесячной оплатой.\n\nМы сопровождаем вас от поиска места и языковой подготовки до визы и переезда.',
    },
  },
  {
    slug: 'it-buero', icon: 'Laptop', image: img('1454165804606-c3d57bc86b40'), visaLabel: '§18b / Blue Card',
    title: { az: 'Ofis və İT mütəxəssisləri', de: 'Büro & IT-Fachkräfte', en: 'Office & IT professionals', ru: 'Офис и IT-специалисты' },
    summary: {
      az: 'Ali təhsilli mütəxəssislər üçün Blue Card və §18b viza.',
      de: 'Blaue Karte EU und §18b für Akademiker.',
      en: 'EU Blue Card and §18b for university graduates.',
      ru: 'Голубая карта ЕС и §18b для специалистов с высшим образованием.',
    },
    items: {
      az: ['İT mütəxəssisləri', 'Mühəndislər', 'Mühasibat və maliyyə', 'İnzibati işlər'],
      de: ['IT-Spezialisten', 'Ingenieure', 'Buchhaltung und Finanzen', 'Verwaltung'],
      en: ['IT specialists', 'Engineers', 'Accounting and finance', 'Administration'],
      ru: ['IT-специалисты', 'Инженеры', 'Бухгалтерия и финансы', 'Администрирование'],
    },
    body: {
      az: 'Ali təhsilli mütəxəssislər üçün AB Mavi Kartı (Blaue Karte EU) ən sürətli yollardan biridir və ailə birləşməsi imkanı verir.\n\nDiplomun anabin bazasında yoxlanılması, ZAB tanınması və işəgötürən axtarışında kömək edirik.',
      de: 'Für Akademiker ist die Blaue Karte EU einer der schnellsten Wege nach Deutschland – inklusive Familiennachzug.\n\nWir helfen bei der anabin-Prüfung, der ZAB-Anerkennung und der Arbeitgebersuche.',
      en: 'For university graduates the EU Blue Card is one of the fastest routes to Germany, including family reunification.\n\nWe help with the anabin check, ZAB recognition and finding an employer.',
      ru: 'Для специалистов с высшим образованием Голубая карта ЕС — один из самых быстрых путей в Германию, с возможностью воссоединения семьи.\n\nПомогаем с проверкой в anabin, признанием в ZAB и поиском работодателя.',
    },
  },
];

const partners = [
  'DB Schenker', 'DHL', 'DACHSER', 'Raben', 'Hermes', 'DSV', 'Kühne+Nagel', 'Nagel-Group', 'GEFCO', 'MAN',
  'Kaya Transport', 'Arin Transport',
];

const portraits = [
  '1507003211169-0a1dd7228f2d', '1494790108377-be9c29b29330', '1500648767791-00dcc994a43e', '1438761681033-6461ffad8d80',
  '1472099645785-5658abf4ff4e', '1544005313-94ddf0286df2', '1527980965255-d3b416303d12', '1534528741775-53994a69daeb',
];

const samples: { profession: L; visaLabel: string; dateLabel: L }[] = [
  { profession: { az: 'LKW sürücüsü', de: 'LKW-Fahrer', en: 'Truck driver', ru: 'Водитель грузовика' }, visaLabel: '§19c', dateLabel: { az: 'Mart 2024', de: 'März 2024', en: 'March 2024', ru: 'Март 2024' } },
  { profession: { az: 'Tibb bacısı', de: 'Pflegefachkraft', en: 'Nurse', ru: 'Медсестра' }, visaLabel: '§16d', dateLabel: { az: 'Aprel 2024', de: 'April 2024', en: 'April 2024', ru: 'Апрель 2024' } },
  { profession: { az: 'Kuryer', de: 'Kurierfahrer', en: 'Courier', ru: 'Курьер' }, visaLabel: '§18b', dateLabel: { az: 'Aprel 2024', de: 'April 2024', en: 'April 2024', ru: 'Апрель 2024' } },
  { profession: { az: 'Aşpaz', de: 'Koch', en: 'Chef', ru: 'Повар' }, visaLabel: '§18b', dateLabel: { az: 'May 2024', de: 'Mai 2024', en: 'May 2024', ru: 'Май 2024' } },
  { profession: { az: 'Anbar işçisi', de: 'Lagerarbeiter', en: 'Warehouse worker', ru: 'Работник склада' }, visaLabel: '§18b', dateLabel: { az: 'İyun 2024', de: 'Juni 2024', en: 'June 2024', ru: 'Июнь 2024' } },
  { profession: { az: 'Qaynaqçı', de: 'Schweißer', en: 'Welder', ru: 'Сварщик' }, visaLabel: '§18a', dateLabel: { az: 'İyul 2024', de: 'Juli 2024', en: 'July 2024', ru: 'Июль 2024' } },
  { profession: { az: 'Tikinti işçisi', de: 'Bauarbeiter', en: 'Construction worker', ru: 'Строитель' }, visaLabel: '§18b', dateLabel: { az: 'İyul 2024', de: 'Juli 2024', en: 'July 2024', ru: 'Июль 2024' } },
  { profession: { az: 'Ofis mütəxəssisi', de: 'Bürofachkraft', en: 'Office specialist', ru: 'Офисный специалист' }, visaLabel: '§18b', dateLabel: { az: 'Avqust 2024', de: 'August 2024', en: 'August 2024', ru: 'Август 2024' } },
];

const testimonials: { quote: L; author: L; role: L; kind: string }[] = [
  {
    kind: 'company',
    quote: {
      az: 'Triad Vision sayəsində Azərbaycandan ixtisaslı və motivasiyalı işçilər qazandıq. Bütün proses peşəkar və etibarlı idi.',
      de: 'Dank Triad Vision konnten wir qualifizierte und motivierte Mitarbeiter aus Aserbaidschan gewinnen. Der gesamte Prozess war professionell und zuverlässig.',
      en: 'Thanks to Triad Vision we gained qualified and motivated employees from Azerbaijan. The whole process was professional and reliable.',
      ru: 'Благодаря Triad Vision мы получили квалифицированных и мотивированных сотрудников из Азербайджана. Весь процесс был профессиональным и надёжным.',
    },
    author: { az: 'Logistika şirkəti', de: 'Logistikunternehmen', en: 'Logistics company', ru: 'Логистическая компания' },
    role: { az: 'Tərəfdaş şirkət, Almaniya', de: 'Partnerunternehmen, Deutschland', en: 'Partner company, Germany', ru: 'Компания-партнёр, Германия' },
  },
  {
    kind: 'candidate',
    quote: {
      az: 'Triad Vision sayəsində 16d viza ilə Almaniyada peşə təhsili almaq imkanı qazandım. Bütün prosesdə peşəkar dəstək göstərdilər.',
      de: 'Dank Triad Vision habe ich mit einem 16d-Visum die Chance auf eine Ausbildung in Deutschland bekommen. Ich wurde im ganzen Prozess professionell unterstützt.',
      en: 'Thanks to Triad Vision I got the chance to train in Germany with a 16d visa. They supported me professionally throughout the process.',
      ru: 'Благодаря Triad Vision я получила возможность учиться в Германии по визе 16d. Меня профессионально поддерживали на всех этапах.',
    },
    author: { az: 'Namizəd', de: 'Kandidatin', en: 'Candidate', ru: 'Кандидат' },
    role: { az: 'Tibb bacısı', de: 'Pflegefachkraft', en: 'Nurse', ru: 'Медсестра' },
  },
  {
    kind: 'candidate',
    quote: {
      az: 'Sənədlərimi kabinetdə yüklədim və hər addımda bildiriş aldım. Səfirlik görüşündən vizanın təsdiqinə qədər hər şey aydın idi.',
      de: 'Ich habe meine Dokumente im Kundenbereich hochgeladen und bei jedem Schritt eine Benachrichtigung erhalten. Vom Botschaftstermin bis zum Visum war alles transparent.',
      en: 'I uploaded my documents in the portal and got a notification at every step. From the embassy appointment to the visa, everything was clear.',
      ru: 'Я загрузил документы в кабинете и получал уведомление на каждом шаге. От записи в посольство до визы всё было прозрачно.',
    },
    author: { az: 'Namizəd', de: 'Kandidat', en: 'Candidate', ru: 'Кандидат' },
    role: { az: 'LKW sürücüsü', de: 'LKW-Fahrer', en: 'Truck driver', ru: 'Водитель грузовика' },
  },
  {
    kind: 'company',
    quote: {
      az: 'Namizədlər əvvəlcədən yaxşı hazırlanmış gəlir, sənədləri tam olur. Uzunmüddətli əməkdaşlığımızdan çox razıyıq.',
      de: 'Die Kandidaten kommen gut vorbereitet und mit vollständigen Unterlagen. Wir sind mit unserer langjährigen Zusammenarbeit sehr zufrieden.',
      en: 'Candidates arrive well prepared with complete documents. We are very happy with our long-term cooperation.',
      ru: 'Кандидаты приезжают хорошо подготовленными, с полным пакетом документов. Мы очень довольны долгосрочным сотрудничеством.',
    },
    author: { az: 'Transport şirkəti', de: 'Transportunternehmen', en: 'Transport company', ru: 'Транспортная компания' },
    role: { az: 'Tərəfdaş şirkət, Almaniya', de: 'Partnerunternehmen, Deutschland', en: 'Partner company, Germany', ru: 'Компания-партнёр, Германия' },
  },
];

const stats: { icon: string; value: number; prefix: string; suffix: string; label: L }[] = [
  { icon: 'Users', value: 500, prefix: '', suffix: '+', label: { az: 'Almaniyaya göndərilən işçilər', de: 'erfolgreich vermittelte Mitarbeiter', en: 'workers placed in Germany', ru: 'работников трудоустроено в Германии' } },
  { icon: 'ShieldCheck', value: 98, prefix: '', suffix: '%', label: { az: 'Uğurlu viza nəticəsi', de: 'positive Visaergebnisse', en: 'successful visa outcomes', ru: 'успешных визовых решений' } },
  { icon: 'Building2', value: 25, prefix: '', suffix: '+', label: { az: 'Almaniyada tərəfdaş şirkətlər', de: 'Partnerunternehmen in Deutschland', en: 'partner companies in Germany', ru: 'компаний-партнёров в Германии' } },
  { icon: 'HardHat', value: 10, prefix: '', suffix: '+', label: { az: 'Fəaliyyət göstərdiyimiz peşə sahələri', de: 'Branchen und Berufsgruppen', en: 'industries and professions', ru: 'отраслей и профессий' } },
  { icon: 'Clock', value: 8, prefix: '3–', suffix: '', label: { az: 'həftə — orta viza emal müddəti', de: 'Wochen durchschnittliche Visabearbeitung', en: 'weeks average visa processing', ru: 'недель — средний срок оформления визы' } },
];

const faqs: { question: L; answer: L; audience: string }[] = [
  {
    audience: 'candidate',
    question: { az: 'Almaniyada işləmək üçün alman dili mütləqdirmi?', de: 'Sind Deutschkenntnisse Pflicht?', en: 'Do I need to speak German?', ru: 'Обязательно ли знание немецкого?' },
    answer: {
      az: 'Peşədən asılıdır. Sürücü və kənd təsərrüfatı işləri üçün A1–A2 kifayət edə bilər, tibb sahəsində isə B1–B2 tələb olunur. Dil hazırlığında sizə kömək edirik.',
      de: 'Das hängt vom Beruf ab. Für Fahrer und Landwirtschaft kann A1–A2 genügen, in der Pflege wird B1–B2 verlangt. Wir unterstützen bei der Sprachvorbereitung.',
      en: 'It depends on the job. A1–A2 can be enough for drivers and agriculture; healthcare requires B1–B2. We help with language preparation.',
      ru: 'Зависит от профессии. Для водителей и сельского хозяйства может хватить A1–A2, в медицине требуется B1–B2. Мы помогаем с языковой подготовкой.',
    },
  },
  {
    audience: 'candidate',
    question: { az: 'Viza prosesi nə qədər çəkir?', de: 'Wie lange dauert das Visumverfahren?', en: 'How long does the visa process take?', ru: 'Сколько длится оформление визы?' },
    answer: {
      az: 'Sənədlər tam olduqda səfirlikdə emal adətən 3–8 həftə çəkir. Ümumi proses (sənəd toplama, müqavilə, səfirlik görüşü) 2–4 ay ola bilər.',
      de: 'Bei vollständigen Unterlagen dauert die Bearbeitung bei der Botschaft meist 3–8 Wochen. Der Gesamtprozess (Unterlagen, Vertrag, Termin) kann 2–4 Monate dauern.',
      en: 'With complete documents, embassy processing usually takes 3–8 weeks. The full process (documents, contract, appointment) can take 2–4 months.',
      ru: 'При полном пакете документов рассмотрение в посольстве обычно занимает 3–8 недель. Весь процесс (документы, договор, запись) может занять 2–4 месяца.',
    },
  },
  {
    audience: 'candidate',
    question: { az: 'Müraciətimin statusunu necə izləyə bilərəm?', de: 'Wie verfolge ich den Status meines Antrags?', en: 'How can I track my application?', ru: 'Как отслеживать статус заявки?' },
    answer: {
      az: 'Qeydiyyatdan keçdikdən sonra şəxsi kabinetinizdə hər addımı görürsünüz. Hər dəyişiklikdə həm kabinetdə, həm də e-poçtla bildiriş alırsınız.',
      de: 'Nach der Registrierung sehen Sie jeden Schritt in Ihrem Kundenbereich. Bei jeder Änderung erhalten Sie eine Benachrichtigung im Portal und per E-Mail.',
      en: 'After registering you can see every step in your account. You get a notification in the portal and by email whenever something changes.',
      ru: 'После регистрации вы видите каждый шаг в личном кабинете. При любом изменении вы получаете уведомление в кабинете и по e-mail.',
    },
  },
  {
    audience: 'candidate',
    question: { az: 'Müqaviləni necə imzalayıram?', de: 'Wie unterschreibe ich den Vertrag?', en: 'How do I sign the contract?', ru: 'Как подписать договор?' },
    answer: {
      az: 'Müqavilə kabinetinizə göndərilir. Onu oxuyub ekranda elektron imza ilə imzalayırsınız. İmzalanmış PDF dərhal kabinetinizdə əlçatan olur.',
      de: 'Der Vertrag wird in Ihren Kundenbereich gestellt. Sie lesen ihn und unterschreiben elektronisch am Bildschirm. Das unterschriebene PDF steht sofort zur Verfügung.',
      en: 'The contract is sent to your account. You read it and sign electronically on screen. The signed PDF is available right away.',
      ru: 'Договор отправляется в ваш кабинет. Вы читаете его и подписываете электронно на экране. Подписанный PDF сразу доступен.',
    },
  },
  {
    audience: 'company',
    question: { az: 'Şirkət olaraq necə əməkdaşlığa başlaya bilərik?', de: 'Wie starten wir als Unternehmen eine Zusammenarbeit?', en: 'How do we start working with you as a company?', ru: 'Как компании начать сотрудничество?' },
    answer: {
      az: '"Əməkdaşlıq təklifi" formunu doldurun: sahəni və lazım olan işçi sayını qeyd edin. 24 saat ərzində sizinlə əlaqə saxlayırıq.',
      de: 'Füllen Sie das Formular „Kooperationsanfrage" aus und nennen Sie Branche und Anzahl der benötigten Mitarbeiter. Wir melden uns innerhalb von 24 Stunden.',
      en: 'Fill in the cooperation request form with your industry and the number of workers you need. We reply within 24 hours.',
      ru: 'Заполните форму «Запрос на сотрудничество», укажите отрасль и нужное количество работников. Мы ответим в течение 24 часов.',
    },
  },
  {
    audience: 'company',
    question: { az: 'Vorabzustimmung və Bundesagentur prosesini kim idarə edir?', de: 'Wer kümmert sich um die Vorabzustimmung der Bundesagentur?', en: 'Who handles the Federal Employment Agency pre-approval?', ru: 'Кто занимается предварительным согласием Bundesagentur?' },
    answer: {
      az: 'Bütün inzibati prosesi biz koordinasiya edirik: Bundesagentur für Arbeit, Ausländerbehörde və səfirliklə yazışmalar daxil olmaqla.',
      de: 'Wir koordinieren den gesamten Verwaltungsprozess – inklusive Kommunikation mit Bundesagentur für Arbeit, Ausländerbehörde und Botschaft.',
      en: 'We coordinate the whole administrative process, including communication with the Federal Employment Agency, the immigration office and the embassy.',
      ru: 'Мы координируем весь административный процесс, включая переписку с Bundesagentur für Arbeit, Ausländerbehörde и посольством.',
    },
  },
  {
    audience: 'all',
    question: { az: 'Vizadan imtina olunarsa nə baş verir?', de: 'Was passiert bei einer Ablehnung?', en: 'What happens if the visa is refused?', ru: 'Что будет при отказе в визе?' },
    answer: {
      az: 'İmtina səbəbi kabinetinizdə göstərilir. Səbəbi təhlil edib təkrar müraciət və ya remonstrasiya imkanlarını sizinlə birlikdə qiymətləndiririk.',
      de: 'Der Ablehnungsgrund wird in Ihrem Kundenbereich angezeigt. Wir analysieren ihn und prüfen mit Ihnen eine erneute Antragstellung oder Remonstration.',
      en: 'The reason is shown in your account. We analyse it and review options such as re-applying or a remonstration with you.',
      ru: 'Причина отказа отображается в вашем кабинете. Мы анализируем её и вместе с вами рассматриваем повторную подачу или ремонстрацию.',
    },
  },
  {
    audience: 'all',
    question: { az: 'Şəxsi məlumatlarım təhlükəsizdirmi?', de: 'Sind meine Daten sicher?', en: 'Is my personal data safe?', ru: 'Безопасны ли мои данные?' },
    answer: {
      az: 'Bəli. Sənədləriniz qorunan serverdə saxlanılır və yalnız siz və məsul əməkdaşlarımız onlara baxa bilər. DSGVO (GDPR) tələblərinə əməl edirik.',
      de: 'Ja. Ihre Dokumente werden auf einem geschützten Server gespeichert und sind nur für Sie und zuständige Mitarbeiter sichtbar. Wir halten die DSGVO ein.',
      en: 'Yes. Your documents are stored on a protected server and only you and responsible staff can see them. We comply with the GDPR.',
      ru: 'Да. Документы хранятся на защищённом сервере и доступны только вам и ответственным сотрудникам. Мы соблюдаем GDPR.',
    },
  },
];

const posts: { slug: string; cover: string; title: L; excerpt: L; body: L; publishedAt: Date }[] = [
  {
    slug: 'fachkraefteeinwanderungsgesetz-2024',
    cover: img('1587330979470-3595ac045ab0'),
    publishedAt: new Date('2026-09-02'),
    title: { az: 'Yeni ixtisaslı işçi immiqrasiyası qanunu: nə dəyişdi?', de: 'Fachkräfteeinwanderungsgesetz: Was hat sich geändert?', en: 'Skilled Immigration Act: what changed?', ru: 'Закон об иммиграции специалистов: что изменилось?' },
    excerpt: { az: 'Almaniyanın yeni qanunu peşəkarlar üçün yolları sadələşdirdi. Əsas dəyişikliklərə baxırıq.', de: 'Das neue Gesetz erleichtert Fachkräften den Weg nach Deutschland. Die wichtigsten Änderungen im Überblick.', en: "Germany's new law makes the route easier for skilled workers. Here are the key changes.", ru: 'Новый закон Германии упростил путь для специалистов. Рассказываем о главных изменениях.' },
    body: {
      az: 'Almaniya son illərdə ixtisaslı işçilərin gəlişini asanlaşdıran bir sıra dəyişikliklər etdi. Təcrübəyə əsaslanan yeni yollar, Chancenkarte (imkan kartı) və Mavi Kart üçün aşağı maaş həddi bunlardan bəziləridir.\n\nBu dəyişikliklər xüsusilə logistika, tikinti və səhiyyə sahələrində çalışmaq istəyən namizədlər üçün yeni imkanlar açır. Hansı yolun sizə uyğun olduğunu öyrənmək üçün bizimlə əlaqə saxlayın.',
      de: 'Deutschland hat in den letzten Jahren zahlreiche Erleichterungen für Fachkräfte eingeführt – darunter erfahrungsbasierte Wege, die Chancenkarte und niedrigere Gehaltsgrenzen für die Blaue Karte.\n\nDiese Änderungen eröffnen besonders in Logistik, Bau und Pflege neue Möglichkeiten. Sprechen Sie uns an, um den passenden Weg zu finden.',
      en: 'In recent years Germany has introduced several changes that make it easier for skilled workers to come, including experience-based routes, the Opportunity Card and lower salary thresholds for the Blue Card.\n\nThese changes open new opportunities especially in logistics, construction and healthcare. Contact us to find the right route for you.',
      ru: 'За последние годы Германия ввела ряд изменений, облегчающих приезд специалистов: пути на основе опыта, карта возможностей (Chancenkarte) и сниженный порог зарплаты для Голубой карты.\n\nЭти изменения открывают новые возможности особенно в логистике, строительстве и медицине. Свяжитесь с нами, чтобы выбрать подходящий путь.',
    },
  },
  {
    slug: 'embassy-appointment-checklist',
    cover: img('1560969184-10fe8719e047'),
    publishedAt: new Date('2026-08-18'),
    title: { az: 'Səfirlik görüşünə hazırlıq: yoxlama siyahısı', de: 'Botschaftstermin: Ihre Checkliste', en: 'Embassy appointment: your checklist', ru: 'Запись в посольство: чек-лист' },
    excerpt: { az: 'Görüşə nələri götürməli və hansı suallara hazır olmalısınız.', de: 'Was Sie mitbringen sollten und auf welche Fragen Sie sich vorbereiten sollten.', en: 'What to bring and which questions to prepare for.', ru: 'Что взять с собой и к каким вопросам готовиться.' },
    body: {
      az: 'Səfirlik görüşü viza prosesinin ən vacib addımıdır. Bütün orijinal sənədləri və onların surətlərini, iki biometrik foto, tibbi sığorta və imzalanmış iş müqaviləsini götürün.\n\nGörüşdə iş yeriniz, vəzifəniz və maaşınız haqqında suallar verilə bilər. Kabinetinizdə səfirlik sənədlərinin tam siyahısını görə bilərsiniz.',
      de: 'Der Botschaftstermin ist der wichtigste Schritt im Visumverfahren. Bringen Sie alle Originale und Kopien, zwei biometrische Fotos, die Krankenversicherung und den unterschriebenen Arbeitsvertrag mit.\n\nIm Gespräch können Fragen zu Arbeitsplatz, Position und Gehalt gestellt werden. Die vollständige Liste finden Sie in Ihrem Kundenbereich.',
      en: 'The embassy appointment is the most important step of the visa process. Bring all originals and copies, two biometric photos, health insurance and the signed employment contract.\n\nYou may be asked about your workplace, position and salary. The full document list is in your account.',
      ru: 'Собеседование в посольстве — важнейший этап визового процесса. Возьмите все оригиналы и копии, два биометрических фото, страховку и подписанный трудовой договор.\n\nВам могут задать вопросы о месте работы, должности и зарплате. Полный список документов есть в вашем кабинете.',
    },
  },
  {
    slug: 'first-month-in-germany',
    cover: img('1599946347371-68eb71b16afc'),
    publishedAt: new Date('2026-07-30'),
    title: { az: 'Almaniyada ilk ay: Anmeldung, bank, sığorta', de: 'Der erste Monat in Deutschland: Anmeldung, Bank, Versicherung', en: 'Your first month in Germany: registration, bank, insurance', ru: 'Первый месяц в Германии: прописка, банк, страховка' },
    excerpt: { az: 'Gəlişdən sonra ilk həftələrdə edilməli olan vacib işlər.', de: 'Die wichtigsten Schritte in den ersten Wochen nach der Ankunft.', en: 'The key steps in your first weeks after arrival.', ru: 'Главные дела в первые недели после приезда.' },
    body: {
      az: 'Almaniyaya gəldikdən sonra 14 gün ərzində ünvan qeydiyyatından (Anmeldung) keçməlisiniz. Ardınca bank hesabı açılır, vergi nömrəsi (Steuer-ID) gəlir və tibbi sığorta aktivləşir.\n\nTriad Vision bu addımlarda da sizinlə olur: yaşayış yeri, qeydiyyat və işə başlama prosesində dəstək veririk.',
      de: 'Nach der Ankunft müssen Sie sich innerhalb von 14 Tagen anmelden. Danach folgen Bankkonto, Steuer-ID und die Aktivierung der Krankenversicherung.\n\nTriad Vision begleitet Sie auch dabei – bei Wohnung, Anmeldung und Arbeitsbeginn.',
      en: 'After arriving you must register your address (Anmeldung) within 14 days. Then come the bank account, tax ID and health insurance.\n\nTriad Vision supports you with housing, registration and starting work.',
      ru: 'После приезда нужно зарегистрироваться по адресу (Anmeldung) в течение 14 дней. Затем — банковский счёт, налоговый номер и медицинская страховка.\n\nTriad Vision помогает и на этом этапе: с жильём, регистрацией и выходом на работу.',
    },
  },
];

/**
 * White-label instance: the first SUPER_ADMIN is created once, with an unusable random password and a one-time
 * "set your password" link (the regular password-reset token, 72 h) printed to the console. Later deploys
 * re-run the seed and leave the account alone; `npx tsx prisma/setupLink.ts` issues a new link if needed.
 */
async function seedWhitelabelAdmin(adminEmail: string) {
  if (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } })) return;
  const user = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
      role: 'SUPER_ADMIN',
      firstName: 'Admin',
      lastName: BRAND_NAME.slice(0, 80),
      locale: 'az',
    },
  });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
  });
  const base = (process.env.CLIENT_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
  console.log(`\n================ FIRST SUPER ADMIN (${adminEmail}) ================`);
  console.log(`One-time setup link (valid 72 h): ${base}/reset-password?token=${token}`);
  console.log('================================================================\n');
}

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@triad-vision.de').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (WHITELABEL && !adminPassword) {
    await seedWhitelabelAdmin(adminEmail);
  } else {
    if (!adminPassword || adminPassword.length < 10) {
      throw new Error('Set SEED_ADMIN_PASSWORD (at least 10 characters) in server/.env before seeding.');
    }
    // The seeded account is the super admin: it manages staff accounts and workspace permissions.
    // Re-running the seed promotes an existing account with this e-mail but never changes its password.
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: 'SUPER_ADMIN', isActive: true },
      create: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: 'SUPER_ADMIN',
        firstName: 'Triad',
        lastName: 'Admin',
        locale: 'az',
      },
    });
  }

  // Starter website content is written once. A marker setting remembers it, so content the admin
  // deletes later (even every visa type) is never re-created by a later deploy.
  const CONTENT_MARKER = 'seed.contentDone';
  const contentSeeded = !!(await prisma.setting.findUnique({ where: { key: CONTENT_MARKER } }));
  const seedTable = async (table: { count: () => Promise<number> }) => !contentSeeded && (await table.count()) === 0;
  if (await seedTable(prisma.visaCategory)) {
    await prisma.visaCategory.createMany({ data: visaCategories.map((v, i) => ({ ...v, sortOrder: i })) });
  }
  if (await seedTable(prisma.service)) {
    await prisma.service.createMany({ data: services.map((v, i) => ({ ...v, sortOrder: i })) });
  }
  // Triad Vision's own business content (partner logos, sample visas, testimonials, statistics, news) is not a
  // template for another agency: the whitelabel profile leaves those tables empty.
  if (!WHITELABEL && (await seedTable(prisma.partner))) {
    await prisma.partner.createMany({ data: partners.map((name, i) => ({ name, sortOrder: i })) });
  }
  if (!WHITELABEL && (await seedTable(prisma.visaSample))) {
    await prisma.visaSample.createMany({
      data: samples.map((s, i) => ({ ...s, image: img(portraits[i % portraits.length], 400), sortOrder: i })),
    });
  }
  if (!WHITELABEL && (await seedTable(prisma.testimonial))) {
    await prisma.testimonial.createMany({ data: testimonials.map((t, i) => ({ ...t, sortOrder: i })) });
  }
  if (!WHITELABEL && (await seedTable(prisma.stat))) {
    await prisma.stat.createMany({ data: stats.map((s, i) => ({ ...s, sortOrder: i })) });
  }
  if (await seedTable(prisma.faq)) {
    await prisma.faq.createMany({ data: faqs.map((f, i) => ({ ...f, sortOrder: i })) });
  }
  if (!WHITELABEL && (await seedTable(prisma.post))) {
    await prisma.post.createMany({ data: posts });
  }
  if (!contentSeeded) await prisma.setting.create({ data: { key: CONTENT_MARKER, value: { at: new Date().toISOString() } } });

  const settings: Record<string, unknown> = {
    contact: {
      phone: '+994 50 748 70 48',
      whatsapp: '+994507487048',
      email: 'abdllyevv@gmail.com',
      hours: { az: 'B.e – Cümə, 09:00 – 18:00', de: 'Mo – Fr, 09:00 – 18:00', en: 'Mon – Fri, 09:00 – 18:00', ru: 'Пн – Пт, 09:00 – 18:00' },
      offices: [
        { city: { az: 'Bakı', de: 'Baku', en: 'Baku', ru: 'Баку' }, address: 'Nizami küç. 96, Port Baku Towers, AZ1010', lat: 40.3777, lng: 49.8664 },
        { city: { az: 'Berlin', de: 'Berlin', en: 'Berlin', ru: 'Берлин' }, address: 'Friedrichstraße 123, 10117 Berlin', lat: 52.5208, lng: 13.3874 },
      ],
    },
    social: {
      instagram: 'https://instagram.com/triadvision',
      facebook: 'https://facebook.com/triadvision',
      linkedin: 'https://linkedin.com/company/triadvision',
      tiktok: 'https://tiktok.com/@triadvision',
    },
  };
  // Contact and social links are Triad Vision's; a white-label agency enters its own in Admin → Settings.
  if (!WHITELABEL) {
    for (const [key, value] of Object.entries(settings)) {
      await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as object } });
    }
  }

  await seedRequirements(prisma);
  await seedJourney(prisma);
  await seedContractTemplates(prisma);
  await seedInterviewPrep(prisma);
  await seedGuides(prisma); // topic guides (/guides): each language version written once
  await seedGuideCalculators(prisma); // calculator shortcodes into guides seeded before they existed (once per row)

  console.log(`Seed complete (${SEED_PROFILE} profile). Admin login: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => basePrisma.$disconnect());

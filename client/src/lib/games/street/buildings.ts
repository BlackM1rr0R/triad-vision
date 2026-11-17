/**
 * Virtual German street (/german-street): the buildings of the self-drawn street (components/street/StreetScene)
 * and where each one leads — an existing game, simulator scene, work scene or explainer, or the two street games
 * (/ticket-machine, /supermarket-game). Pure data (no React), so the progress helper and the tests can import it.
 */
import type { Tx } from '@/lib/games/common';

export type BuildingId =
  | 'baeckerei'
  | 'apotheke'
  | 'buergeramt'
  | 'bank'
  | 'bahnhof'
  | 'supermarkt'
  | 'arztpraxis'
  | 'post'
  | 'wohnhaus'
  | 'baustelle'
  | 'restaurant'
  | 'krankenhaus'
  | 'muell'
  | 'schilder'
  | 'sprachschule';

/** Kind of a "go in" link; the label is street.links.<kind> (i18n/pagesGermanStreet). */
export type LinkKind =
  | 'simAnmeldung'
  | 'simBank'
  | 'simDoctor'
  | 'simHeating'
  | 'priceGame'
  | 'ticket'
  | 'supermarket'
  | 'apartment'
  | 'workConstruction'
  | 'workKitchen'
  | 'workHospital'
  | 'waste'
  | 'signs'
  | 'mockExam'
  | 'pronunciation'
  | 'levelSelf'
  | 'emergency'
  | 'glossary';

export interface StreetLink {
  kind: LinkKind;
  to: string;
}

export interface Building {
  id: BuildingId;
  /** German name with article, read aloud. */
  de: string;
  /** Short sign text on the façade. */
  sign: string;
  /** Left edge and width of the clickable area in the street's viewBox (STREET_W × STREET_H). */
  x: number;
  w: number;
  intro: Tx;
  links: StreetLink[];
  glossary: string[];
}

export const STREET_W = 2700;
export const STREET_H = 640;
/** Sidewalk line: buildings stand on it. */
export const GROUND_Y = 470;

// prettier-ignore
export const BUILDINGS: Building[] = [
  {
    id: 'wohnhaus', de: 'das Wohnhaus', sign: 'Nr. 12', x: 20, w: 180,
    intro: {
      az: 'Kirayə mənzil: istilik, havalandırma, zibil qaydaları, sakitlik saatları və Nebenkosten. Mənzili gəzin və qonşu ilə istilik dialoqunu məşq edin.',
      de: 'Die Mietwohnung: Heizung, Lüften, Mülltrennung, Ruhezeiten und Nebenkosten. Erkunden Sie die Wohnung und üben Sie das Gespräch über die Heizung.',
      en: 'Your rented flat: heating, airing, bins, quiet hours and Nebenkosten. Explore the flat and practise the heating conversation.',
      ru: 'Съёмная квартира: отопление, проветривание, мусор, часы тишины и Nebenkosten. Осмотрите квартиру и потренируйте диалог об отоплении.',
      tr: 'Kiralık daire: ısıtma, havalandırma, çöp, sessizlik saatleri ve Nebenkosten. Daireyi gezin ve ısıtma konuşmasını çalışın.',
      uk: 'Орендована квартира: опалення, провітрювання, сміття, години тиші й Nebenkosten. Огляньте квартиру та потренуйте діалог про опалення.',
    },
    links: [{ kind: 'apartment', to: '/german-apartment' }, { kind: 'simHeating', to: '/german-simulator?scene=heating' }],
    glossary: ['nebenkosten', 'hausordnung', 'ruhezeiten'],
  },
  {
    id: 'muell', de: 'die Mülltonnen', sign: 'Müll', x: 210, w: 90,
    intro: {
      az: 'Almaniyada zibil çeşidlənir: Gelber Sack, Papier, Bio, Restmüll, şüşə və Pfand. Səhv qab — qonşularla problem və bəzən cərimə.',
      de: 'In Deutschland wird Müll getrennt: Gelber Sack, Papier, Bio, Restmüll, Glas und Pfand. Falsche Tonne heißt Ärger mit Nachbarn, manchmal Bußgeld.',
      en: 'Germany sorts its rubbish: yellow bag, paper, bio, residual waste, glass and Pfand. The wrong bin means trouble with neighbours, sometimes a fine.',
      ru: 'В Германии мусор сортируют: жёлтый мешок, бумага, био, остаточный мусор, стекло и Pfand. Не тот бак — проблемы с соседями, иногда штраф.',
      tr: 'Almanya’da çöp ayrıştırılır: sarı torba, kâğıt, bio, karışık atık, cam ve Pfand. Yanlış kutu komşularla sorun, bazen ceza demektir.',
      uk: 'У Німеччині сміття сортують: жовтий мішок, папір, біо, залишкове сміття, скло й Pfand. Не той бак — проблеми із сусідами, іноді штраф.',
    },
    links: [{ kind: 'waste', to: '/waste-sorting' }],
    glossary: ['muelltrennung', 'pfand'],
  },
  {
    id: 'baeckerei', de: 'die Bäckerei', sign: 'Bäckerei', x: 310, w: 150,
    intro: {
      az: 'Səhər Brötchen, Brezel və təzə çörək. Çörək nə qədərdir? Qiymət oyununda yoxlayın: çörək, Döner, kirayə və bilet.',
      de: 'Morgens Brötchen, Brezeln und frisches Brot. Was kostet das? Testen Sie es im Preis-Raten: Brot, Döner, Miete und Ticket.',
      en: 'Rolls, pretzels and fresh bread in the morning. What does it cost? Test yourself in the price game: bread, döner, rent and tickets.',
      ru: 'Утром булочки, брецели и свежий хлеб. Сколько это стоит? Проверьте себя в игре «Угадай цену»: хлеб, дёнер, аренда и билеты.',
      tr: 'Sabahları Brötchen, Brezel ve taze ekmek. Ne kadar? Fiyat oyununda deneyin: ekmek, döner, kira ve bilet.',
      uk: 'Зранку булочки, брецелі та свіжий хліб. Скільки це коштує? Перевірте себе у грі «Вгадай ціну»: хліб, дьонер, оренда й квитки.',
    },
    links: [{ kind: 'priceGame', to: '/price-game' }],
    glossary: [],
  },
  {
    id: 'apotheke', de: 'die Apotheke', sign: 'Apotheke', x: 470, w: 140,
    intro: {
      az: 'Dərmanlar yalnız aptekdə satılır, reseptli dərmanlara Zuzahlung (5–10 €) ödənilir. Gecə və bayram günləri növbətçi aptek (Notdienst) açıqdır.',
      de: 'Medikamente gibt es in der Apotheke; für Rezeptmedikamente zahlen Sie meist 5–10 € Zuzahlung. Nachts und an Feiertagen hat eine Notdienst-Apotheke offen.',
      en: 'Medicines are sold in the pharmacy; for prescription drugs you usually pay a €5–10 co-payment. At night and on holidays an on-duty pharmacy is open.',
      ru: 'Лекарства продаются в аптеке; за рецептурные обычно доплата 5–10 €. Ночью и в праздники работает дежурная аптека (Notdienst).',
      tr: 'İlaçlar eczanede satılır; reçeteli ilaçlar için genelde 5–10 € katkı payı ödenir. Gece ve tatillerde nöbetçi eczane açıktır.',
      uk: 'Ліки продають в аптеці; за рецептурні зазвичай доплата 5–10 €. Уночі та у свята працює чергова аптека (Notdienst).',
    },
    links: [{ kind: 'glossary', to: '/glossary/apotheke' }, { kind: 'emergency', to: '/emergency-wallpaper' }],
    glossary: ['apotheke', 'rezept', 'zuzahlung'],
  },
  {
    id: 'buergeramt', de: 'das Bürgeramt', sign: 'Bürgeramt', x: 800, w: 200,
    intro: {
      az: 'İlk vacib addım: köçdükdən sonra 2 həftə ərzində ünvan qeydiyyatı (Anmeldung). Termin, Wohnungsgeberbestätigung və pasport lazımdır. Dialoqu məşq edin.',
      de: 'Der erste wichtige Schritt: die Anmeldung innerhalb von 2 Wochen nach dem Einzug. Sie brauchen Termin, Wohnungsgeberbestätigung und Pass. Üben Sie das Gespräch.',
      en: 'The first big step: registering your address (Anmeldung) within 2 weeks of moving in. You need an appointment, the landlord form and your passport. Practise the dialogue.',
      ru: 'Первый важный шаг: регистрация (Anmeldung) в течение 2 недель после въезда. Нужны термин, Wohnungsgeberbestätigung и паспорт. Потренируйте диалог.',
      tr: 'İlk önemli adım: taşındıktan sonra 2 hafta içinde adres kaydı (Anmeldung). Randevu, ev sahibi belgesi ve pasaport gerekir. Diyaloğu çalışın.',
      uk: 'Перший важливий крок: реєстрація (Anmeldung) протягом 2 тижнів після заселення. Потрібні термін, Wohnungsgeberbestätigung і паспорт. Потренуйте діалог.',
    },
    links: [{ kind: 'simAnmeldung', to: '/german-simulator?scene=anmeldung' }],
    glossary: ['anmeldung', 'buergeramt', 'wohnungsgeberbestaetigung'],
  },
  {
    id: 'bank', de: 'die Bank', sign: 'Bank', x: 1010, w: 160,
    intro: {
      az: 'Maaş üçün alman hesabı (Girokonto) lazımdır. Bankda IBAN, girocard və onlayn-bankinq haqqında danışın — dialoqu məşq edin.',
      de: 'Für Ihr Gehalt brauchen Sie ein Girokonto. Bei der Bank geht es um IBAN, girocard und Online-Banking — üben Sie das Gespräch.',
      en: 'You need a German current account (Girokonto) for your salary. At the bank it is about IBAN, girocard and online banking — practise the conversation.',
      ru: 'Для зарплаты нужен немецкий счёт (Girokonto). В банке речь об IBAN, girocard и онлайн-банке — потренируйте разговор.',
      tr: 'Maaşınız için bir Alman vadesiz hesabı (Girokonto) gerekir. Bankada IBAN, girocard ve online bankacılık konuşulur — diyaloğu çalışın.',
      uk: 'Для зарплати потрібен німецький рахунок (Girokonto). У банку йдеться про IBAN, girocard та онлайн-банкінг — потренуйте розмову.',
    },
    links: [{ kind: 'simBank', to: '/german-simulator?scene=bank' }],
    glossary: ['girokonto', 'iban', 'girocard'],
  },
  {
    id: 'bahnhof', de: 'der Bahnhof', sign: 'Bahnhof', x: 1280, w: 270,
    intro: {
      az: 'Avtomatdan bilet almaq: təyinat, tarif zonası (AB/ABC), bilet növü və ödəniş. Biletsiz və ya səhv zona ilə səfər adətən 60 € cərimədir.',
      de: 'Fahrkarte am Automaten: Ziel, Tarifzone (AB/ABC), Fahrkartenart und Bezahlen. Ohne gültige Fahrkarte kostet es meist 60 € erhöhtes Beförderungsentgelt.',
      en: 'Buying a ticket at the machine: destination, fare zone (AB/ABC), ticket type and payment. Riding without a valid ticket usually costs a €60 penalty fare.',
      ru: 'Билет в автомате: пункт назначения, тарифная зона (AB/ABC), вид билета и оплата. Поездка без действительного билета обычно стоит 60 € штрафа.',
      tr: 'Otomattan bilet: varış yeri, tarife bölgesi (AB/ABC), bilet türü ve ödeme. Geçerli bilet olmadan yolculuk genelde 60 € cezadır.',
      uk: 'Квиток в автоматі: пункт призначення, тарифна зона (AB/ABC), вид квитка й оплата. Поїздка без дійсного квитка зазвичай коштує 60 € штрафу.',
    },
    links: [{ kind: 'ticket', to: '/ticket-machine' }],
    glossary: ['deutschlandticket'],
  },
  {
    id: 'supermarkt', de: 'der Supermarkt', sign: 'Supermarkt', x: 1560, w: 230,
    intro: {
      az: 'Alış-veriş siyahısı ilə rəflərdə Quark, Sahne, Mehl Type 405 və Sprudel tapın, Pfand şüşələrini qaytarın və kassada çeki oxuyun.',
      de: 'Mit dem Einkaufszettel Quark, Sahne, Mehl Type 405 und Sprudel finden, Pfandflaschen zurückgeben und an der Kasse den Kassenbon lesen.',
      en: 'Find Quark, Sahne, Mehl Type 405 and Sprudel from a shopping list, return your Pfand bottles and read the receipt at the till.',
      ru: 'По списку покупок найдите Quark, Sahne, Mehl Type 405 и Sprudel, сдайте бутылки Pfand и разберите чек на кассе.',
      tr: 'Alışveriş listesiyle Quark, Sahne, Mehl Type 405 ve Sprudel bulun, Pfand şişelerini iade edin ve kasada fişi okuyun.',
      uk: 'За списком покупок знайдіть Quark, Sahne, Mehl Type 405 і Sprudel, здайте пляшки Pfand і розберіть чек на касі.',
    },
    links: [{ kind: 'supermarket', to: '/supermarket-game' }],
    glossary: ['pfand', 'mehrwertsteuer'],
  },
  {
    id: 'arztpraxis', de: 'die Arztpraxis', sign: 'Praxis', x: 1800, w: 170,
    intro: {
      az: 'Hausarzt — ilk müraciət yeri. Termin alın, elektron sığorta kartını göstərin, simptomları izah edin. Həkim dialoqunu məşq edin.',
      de: 'Der Hausarzt ist die erste Anlaufstelle. Termin vereinbaren, Gesundheitskarte zeigen, Beschwerden erklären — üben Sie das Arztgespräch.',
      en: 'The family doctor (Hausarzt) is your first stop. Book an appointment, show your health card, describe your symptoms — practise the doctor dialogue.',
      ru: 'Домашний врач (Hausarzt) — первая точка обращения. Запишитесь, покажите страховую карту, опишите симптомы — потренируйте диалог.',
      tr: 'Aile hekimi (Hausarzt) ilk adres. Randevu alın, sağlık kartını gösterin, şikâyetleri anlatın — doktor diyaloğunu çalışın.',
      uk: 'Сімейний лікар (Hausarzt) — перше місце звернення. Запишіться, покажіть страхову картку, опишіть симптоми — потренуйте діалог.',
    },
    links: [{ kind: 'simDoctor', to: '/german-simulator?scene=doctor' }],
    glossary: ['hausarzt', 'elektronische-gesundheitskarte', 'krankmeldung'],
  },
  {
    id: 'post', de: 'die Post / die Packstation', sign: 'Post', x: 1980, w: 130,
    intro: {
      az: 'Məktub, bağlama və Einschreiben (sifarişli məktub) — rəsmi sənədlər üçün vacibdir. Packstation 7/24 bağlama götürmək üçün avtomatdır.',
      de: 'Briefe, Pakete und Einschreiben — wichtig für Kündigungen und Fristen. Die Packstation ist ein Automat, an dem Sie Pakete rund um die Uhr abholen.',
      en: 'Letters, parcels and registered mail (Einschreiben) — important for notices and deadlines. A Packstation is a locker where you collect parcels 24/7.',
      ru: 'Письма, посылки и заказные письма (Einschreiben) — важно для расторжений и сроков. Packstation — автомат для получения посылок круглосуточно.',
      tr: 'Mektup, paket ve iadeli taahhütlü mektup (Einschreiben) — fesih ve süreler için önemli. Packstation 7/24 paket alınan bir otomattır.',
      uk: 'Листи, посилки й рекомендовані листи (Einschreiben) — важливо для розірвань і строків. Packstation — автомат для отримання посилок цілодобово.',
    },
    links: [{ kind: 'glossary', to: '/glossary/einschreiben' }],
    glossary: ['einschreiben', 'frist', 'kuendigung'],
  },
  {
    id: 'restaurant', de: 'das Restaurant', sign: 'Restaurant', x: 2120, w: 150,
    intro: {
      az: 'Restoran mətbəxində iş: avadanlıq, gigiyena (HACCP), allergenlər və alman mətbəx sözləri — interaktiv səhnədə.',
      de: 'Arbeiten in der Restaurantküche: Geräte, Hygiene (HACCP), Allergene und Küchenwortschatz — in der interaktiven Szene.',
      en: 'Working in a restaurant kitchen: equipment, hygiene (HACCP), allergens and kitchen German — in the interactive scene.',
      ru: 'Работа на кухне ресторана: оборудование, гигиена (HACCP), аллергены и кухонная лексика — в интерактивной сцене.',
      tr: 'Restoran mutfağında çalışmak: ekipman, hijyen (HACCP), alerjenler ve mutfak Almancası — etkileşimli sahnede.',
      uk: 'Робота на кухні ресторану: обладнання, гігієна (HACCP), алергени та кухонна лексика — в інтерактивній сцені.',
    },
    links: [{ kind: 'workKitchen', to: '/work-scenes/restaurant-kitchen' }],
    glossary: [],
  },
  {
    id: 'baustelle', de: 'die Baustelle', sign: 'Baustelle', x: 2280, w: 160,
    intro: {
      az: 'Tikinti meydançası: dəbilqə, iskele, kran və təhlükəsizlik qaydaları alman dilində. İş səhnəsində sözləri öyrənin.',
      de: 'Die Baustelle: Helm, Gerüst, Kran und Sicherheitsregeln auf Deutsch. Lernen Sie die Wörter in der Arbeitsszene.',
      en: 'The construction site: helmet, scaffolding, crane and safety rules in German. Learn the words in the work scene.',
      ru: 'Стройка: каска, леса, кран и правила безопасности на немецком. Выучите слова в рабочей сцене.',
      tr: 'Şantiye: baret, iskele, vinç ve Almanca güvenlik kuralları. Kelimeleri iş sahnesinde öğrenin.',
      uk: 'Будмайданчик: каска, риштування, кран і правила безпеки німецькою. Вивчіть слова в робочій сцені.',
    },
    links: [{ kind: 'workConstruction', to: '/work-scenes/construction-site' }],
    glossary: ['berufsgenossenschaft', 'arbeitsunfall'],
  },
  {
    id: 'krankenhaus', de: 'das Krankenhaus', sign: 'Klinikum', x: 2450, w: 220,
    intro: {
      az: 'Xəstəxana palatası: tibb bacısının işi, gigiyena, infuziya və xəstə ilə ünsiyyət. Təcili hal üçün 112 — xəstəxananın Notaufnahme şöbəsi.',
      de: 'Die Krankenstation: Pflegealltag, Händehygiene, Infusion und Gespräche mit Patienten. Im Notfall: 112 und die Notaufnahme.',
      en: 'The hospital ward: nursing routines, hand hygiene, infusions and talking to patients. In an emergency: call 112, go to the Notaufnahme.',
      ru: 'Больничное отделение: работа медсестры, гигиена рук, инфузии и общение с пациентами. В экстренном случае: 112 и Notaufnahme.',
      tr: 'Hastane servisi: hemşirelik rutini, el hijyeni, infüzyon ve hastalarla iletişim. Acil durumda: 112 ve Notaufnahme.',
      uk: 'Лікарняне відділення: робота медсестри, гігієна рук, інфузії та спілкування з пацієнтами. У надзвичайній ситуації: 112 і Notaufnahme.',
    },
    links: [{ kind: 'workHospital', to: '/work-scenes/hospital-ward' }, { kind: 'emergency', to: '/emergency-wallpaper' }],
    glossary: ['notaufnahme', 'notruf'],
  },
];

/** The traffic signs (street furniture on the pavement) and the language school, between the houses. */
// prettier-ignore
export const EXTRAS: Building[] = [
  {
    id: 'schilder', de: 'die Verkehrsschilder', sign: 'STVO', x: 1180, w: 90,
    intro: {
      az: 'Almaniyada yol nişanlarını bilmək həm sürücü, həm piyada və velosipedçi üçün vacibdir: üstünlük, qadağa və xəbərdarlıq nişanları.',
      de: 'Verkehrszeichen muss man kennen — als Autofahrer, zu Fuß und auf dem Rad: Vorfahrt, Verbote und Gefahrzeichen.',
      en: 'You need to know German traffic signs — as a driver, pedestrian and cyclist: priority, prohibitions and warnings.',
      ru: 'Дорожные знаки Германии нужно знать — водителю, пешеходу и велосипедисту: приоритет, запреты и предупреждения.',
      tr: 'Alman trafik işaretlerini bilmek gerekir — sürücü, yaya ve bisikletli olarak: öncelik, yasak ve uyarılar.',
      uk: 'Дорожні знаки Німеччини треба знати — водієві, пішоходові й велосипедистові: пріоритет, заборони та попередження.',
    },
    links: [{ kind: 'signs', to: '/traffic-signs' }],
    glossary: [],
  },
  {
    id: 'sprachschule', de: 'die Sprachschule', sign: 'Sprachschule', x: 620, w: 170,
    intro: {
      az: 'Alman dili kursu: A1 və B1 sınaq imtahanı, tələffüz məşqçisi və səviyyənizi özünüz qiymətləndirmək üçün test.',
      de: 'Die Sprachschule: Übungsprüfungen A1 und B1, Aussprachetrainer und eine Selbsteinschätzung Ihres Niveaus.',
      en: 'The language school: A1 and B1 mock exams, the pronunciation trainer and a self-assessment of your level.',
      ru: 'Языковая школа: пробные экзамены A1 и B1, тренажёр произношения и самооценка уровня.',
      tr: 'Dil okulu: A1 ve B1 deneme sınavları, telaffuz çalıştırıcısı ve seviye öz değerlendirmesi.',
      uk: 'Мовна школа: пробні іспити A1 і B1, тренажер вимови та самооцінка рівня.',
    },
    links: [{ kind: 'mockExam', to: '/german-mock-exam' }, { kind: 'pronunciation', to: '/pronunciation' }, { kind: 'levelSelf', to: '/german-level-test-self' }],
    glossary: ['sprachzertifikat', 'integrationskurs'],
  },
];

/** Every place of the street in walking order (left to right). */
export const PLACES: Building[] = [...BUILDINGS, ...EXTRAS].sort((a, b) => a.x - b.x);

export const placeById = (id: string | null | undefined): Building | null => PLACES.find((p) => p.id === id) ?? null;

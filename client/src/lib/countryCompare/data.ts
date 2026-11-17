/**
 * Germany vs Poland vs Czech Republic vs United Kingdom vs Austria for a skilled worker from Azerbaijan
 * (/germany-vs-other-countries). Plain data, no imports.
 *
 * Every fact was checked on 2026-11-16 against the sources in COUNTRY_SOURCES (official pages wherever one
 * exists). Values that are ranges or estimates are written as such; salaries are ESTIMATES (see SALARY_NOTE_KEYS)
 * and net pay is a rough ratio for a single person without children — never an exact tax calculation.
 * When a rule is in transition (UK settlement, Polish citizenship reform, Czech deadlines) the cell says so.
 */

export const COUNTRY_AS_OF = '2026-11-16';

export const LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type Lang = (typeof LANGS)[number];
export type L6 = Record<Lang, string>;
const l6 = (az: string, de: string, en: string, ru: string, tr: string, uk: string): L6 => ({ az, de, en, ru, tr, uk });

export const COUNTRIES = ['de', 'pl', 'cz', 'uk', 'at'] as const;
export type Country = (typeof COUNTRIES)[number];

export const COUNTRY_FLAG: Record<Country, string> = { de: '🇩🇪', pl: '🇵🇱', cz: '🇨🇿', uk: '🇬🇧', at: '🇦🇹' };

export const CRITERIA = ['minWage', 'route', 'processing', 'fees', 'language', 'family', 'settlement', 'citizenship', 'priceLevel', 'schengen'] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Eurostat price level index of household final consumption expenditure, EU27 = 100 (tec00120, 2025). */
export const PRICE_LEVEL: Record<Country, number> = { de: 108.3, pl: 73.3, cz: 89.4, uk: 123.3, at: 113.0 };
export const PRICE_LEVEL_YEAR = 2025;

export const CELLS: Record<Criterion, Record<Country, L6>> = {
  minWage: {
    de: l6(
      '13,90 €/saat (tam ştatda ≈ 2 410 €/ay); 1.1.2027-dən 14,60 €',
      '13,90 €/Std. (Vollzeit ≈ 2.410 €/Monat); ab 1.1.2027: 14,60 €',
      '€13.90/h (full time ≈ €2,410/month); €14.60 from 1 Jan 2027',
      '13,90 €/час (полная ставка ≈ 2 410 €/мес.); с 1.1.2027 — 14,60 €',
      '13,90 €/saat (tam zamanlı ≈ 2.410 €/ay); 1.1.2027’den itibaren 14,60 €',
      '13,90 €/год (повна ставка ≈ 2 410 €/міс.); з 1.1.2027 — 14,60 €',
    ),
    pl: l6(
      '4 806 PLN/ay (≈ 1 130 €), 31,40 PLN/saat',
      '4.806 PLN/Monat (≈ 1.130 €), 31,40 PLN/Std.',
      'PLN 4,806/month (≈ €1,130), PLN 31.40/h',
      '4 806 PLN/мес. (≈ 1 130 €), 31,40 PLN/час',
      '4.806 PLN/ay (≈ 1.130 €), 31,40 PLN/saat',
      '4 806 PLN/міс. (≈ 1 130 €), 31,40 PLN/год',
    ),
    cz: l6(
      '22 400 CZK/ay (≈ 920 €), 134,40 CZK/saat',
      '22.400 CZK/Monat (≈ 920 €), 134,40 CZK/Std.',
      'CZK 22,400/month (≈ €920), CZK 134.40/h',
      '22 400 CZK/мес. (≈ 920 €), 134,40 CZK/час',
      '22.400 CZK/ay (≈ 920 €), 134,40 CZK/saat',
      '22 400 CZK/міс. (≈ 920 €), 134,40 CZK/год',
    ),
    uk: l6(
      'Aprel 2026-dan 12,71 £/saat (≈ 2 200 £/ay)',
      '12,71 £/Std. ab April 2026 (≈ 2.200 £/Monat)',
      '£12.71/h from April 2026 (≈ £2,200/month)',
      '12,71 £/час с апреля 2026 (≈ 2 200 £/мес.)',
      'Nisan 2026’dan itibaren 12,71 £/saat (≈ 2.200 £/ay)',
      '12,71 £/год з квітня 2026 (≈ 2 200 £/міс.)',
    ),
    at: l6(
      'Qanuni minimum əmək haqqı yoxdur; minimumu kollektiv müqavilələr müəyyən edir (ildə 14 maaş)',
      'Kein gesetzlicher Mindestlohn; Mindestlöhne legen die Kollektivverträge fest (14 Gehälter im Jahr)',
      'No statutory minimum wage; collective agreements set minimum pay (14 salaries a year)',
      'Законного МРОТ нет; минимум задают коллективные договоры (14 зарплат в год)',
      'Yasal asgari ücret yok; asgari ücreti toplu sözleşmeler belirler (yılda 14 maaş)',
      'Законної мінімалки немає; мінімум задають колективні договори (14 зарплат на рік)',
    ),
  },
  route: {
    de: l6(
      'Mütəxəssis § 18a / § 18b, AB Mavi Kartı, təcrübə yolu § 19c (2), Chancenkarte — peşə təhsili (kollec) də sayılır',
      'Fachkraft § 18a / § 18b, Blaue Karte EU, Erfahrungsweg § 19c Abs. 2, Chancenkarte — auch Berufsausbildungen zählen',
      'Skilled worker § 18a / § 18b, EU Blue Card, experience route § 19c (2), Opportunity Card — vocational qualifications count too',
      'Специалист § 18a / § 18b, Голубая карта ЕС, путь через опыт § 19c (2), Chancenkarte — профобразование тоже подходит',
      'Nitelikli işçi § 18a / § 18b, AB Mavi Kart, deneyim yolu § 19c (2), Fırsat Kartı — meslek eğitimi de geçerli',
      'Фахівець § 18a / § 18b, Блакитна карта ЄС, шлях через досвід § 19c (2), Chancenkarte — профосвіта теж рахується',
    ),
    pl: l6(
      'İş icazəsi (A tipi) + milli D vizası və ya birləşmiş müvəqqəti yaşayış və iş icazəsi',
      'Arbeitserlaubnis (Typ A) + nationales D-Visum oder kombinierte Aufenthalts- und Arbeitserlaubnis',
      'Work permit (type A) + national D visa, or a combined temporary residence and work permit',
      'Разрешение на работу (тип A) + национальная виза D или единое разрешение на пребывание и работу',
      'Çalışma izni (A tipi) + ulusal D vizesi veya birleşik geçici oturma ve çalışma izni',
      'Дозвіл на роботу (тип A) + національна віза D або єдиний дозвіл на проживання і роботу',
    ),
    cz: l6(
      'İşçi kartı (zaměstnanecká karta). Azərbaycan “Kvalifikovaný zaměstnanec” sürətli proqramına daxil deyil',
      'Arbeitnehmerkarte (zaměstnanecká karta). Aserbaidschan ist nicht im Schnellprogramm „Kvalifikovaný zaměstnanec“',
      'Employee card (zaměstnanecká karta). Azerbaijan is not in the “Qualified Employee” fast-track programme',
      'Карта сотрудника (zaměstnanecká karta). Азербайджан не входит в ускоренную программу «Kvalifikovaný zaměstnanec»',
      'Çalışan kartı (zaměstnanecká karta). Azerbaycan “Kvalifikovaný zaměstnanec” hızlı programında değil',
      'Картка працівника (zaměstnanecká karta). Азербайджан не входить до прискореної програми «Kvalifikovaný zaměstnanec»',
    ),
    uk: l6(
      'Skilled Worker vizası: 22.07.2025-dən iş ali təhsil səviyyəsində (RQF 6) olmalıdır, qıtlıq siyahısı istisnadır; maaş 41 700 £ və ya “going rate”',
      'Skilled Worker Visa: seit 22.07.2025 nur Stellen auf Hochschulniveau (RQF 6), außer Mangellisten; Gehalt 41.700 £ oder „going rate“',
      'Skilled Worker visa: since 22 July 2025 only degree-level jobs (RQF 6) unless on a shortage list; salary £41,700 or the going rate',
      'Skilled Worker visa: с 22.07.2025 только должности уровня вуза (RQF 6), кроме списков дефицита; зарплата 41 700 £ или «going rate»',
      'Skilled Worker vizesi: 22.07.2025’ten beri yalnızca üniversite düzeyi işler (RQF 6), eksik meslek listeleri hariç; maaş 41.700 £ veya “going rate”',
      'Skilled Worker visa: з 22.07.2025 лише посади рівня ЗВО (RQF 6), крім списків дефіциту; зарплата 41 700 £ або «going rate»',
    ),
    at: l6(
      'Rot-Weiß-Rot-Karte (xal sistemi: qıtlıq peşələri üçün 90-dan 55 xal) və ya AB Mavi Kartı',
      'Rot-Weiß-Rot-Karte (Punktesystem: Mangelberufe 55 von 90 Punkten) oder Blaue Karte EU',
      'Red-White-Red Card (points: 55 of 90 for shortage occupations) or EU Blue Card',
      'Rot-Weiß-Rot-Karte (баллы: 55 из 90 для дефицитных профессий) или Голубая карта ЕС',
      'Rot-Weiß-Rot-Karte (puan: eksik mesleklerde 90 üzerinden 55) veya AB Mavi Kart',
      'Rot-Weiß-Rot-Karte (бали: 55 із 90 для дефіцитних професій) або Блакитна карта ЄС',
    ),
  },
  processing: {
    de: l6(
      'Bakıda adətən 12 həftəyə qədər; sürətləndirilmiş prosedurda (§ 81a) səfirlik tam ərizədən sonra adətən 3 həftəyə qərar verir',
      'In Baku meist bis zu 12 Wochen; im beschleunigten Verfahren (§ 81a) entscheidet die Botschaft in der Regel binnen 3 Wochen nach vollständigem Antrag',
      'In Baku usually up to 12 weeks; in the fast-track procedure (§ 81a) the embassy usually decides within 3 weeks of a complete application',
      'В Баку обычно до 12 недель; в ускоренной процедуре (§ 81a) посольство обычно решает за 3 недели после полного пакета',
      'Bakü’de genellikle 12 haftaya kadar; hızlandırılmış prosedürde (§ 81a) büyükelçilik tam başvurudan sonra genellikle 3 haftada karar verir',
      'У Баку зазвичай до 12 тижнів; у прискореній процедурі (§ 81a) посольство зазвичай вирішує за 3 тижні після повного пакета',
    ),
    pl: l6(
      'İş icazəsi adətən bir neçə həftə – bir neçə ay; yaşayış icazəsi qərarları praktikada çox vaxt aylarla çəkir',
      'Arbeitserlaubnis meist einige Wochen bis Monate; Entscheidungen über Aufenthaltstitel dauern in der Praxis oft viele Monate',
      'Work permit typically a few weeks to months; residence permit decisions often take many months in practice',
      'Разрешение на работу обычно от нескольких недель до месяцев; решения о ВНЖ на практике часто занимают много месяцев',
      'Çalışma izni genellikle birkaç hafta ile birkaç ay; oturma izni kararları uygulamada çoğu zaman aylar sürer',
      'Дозвіл на роботу зазвичай від кількох тижнів до місяців; рішення про посвідку на практиці часто тривають багато місяців',
    ),
    cz: l6(
      'Qanunla 60 gün, mürəkkəb hallarda 90 gün (§ 169t; praktikada çox vaxt daha uzun)',
      'Gesetzlich 60 Tage, in komplexen Fällen 90 Tage (§ 169t; in der Praxis oft länger)',
      '60 days by law, 90 in complex cases (§ 169t; often longer in practice)',
      'По закону 60 дней, в сложных случаях 90 (§ 169t; на практике часто дольше)',
      'Yasal olarak 60 gün, karmaşık durumlarda 90 gün (§ 169t; uygulamada çoğu zaman daha uzun)',
      'За законом 60 днів, у складних випадках 90 (§ 169t; на практиці часто довше)',
    ),
    uk: l6(
      'Ölkə xaricindən müraciətdə adətən 3 həftə',
      'Bei Antrag außerhalb des UK meist 3 Wochen',
      'Usually 3 weeks when applying from outside the UK',
      'При подаче из-за пределов UK обычно 3 недели',
      'Birleşik Krallık dışından başvuruda genellikle 3 hafta',
      'При подачі з-за меж UK зазвичай 3 тижні',
    ),
    at: l6('Qanunla 8 həftə', 'Gesetzlich 8 Wochen', '8 weeks by law', 'По закону 8 недель', 'Yasal olarak 8 hafta', 'За законом 8 тижнів'),
  },
  fees: {
    de: l6(
      'Viza 75 €; sürətləndirilmiş prosedur 411 € (adətən işəgötürən ödəyir); tanınma adətən 100–600 €',
      'Visum 75 €; beschleunigtes Verfahren 411 € (meist Arbeitgeber); Anerkennung meist 100–600 €',
      'Visa €75; fast-track €411 (usually paid by the employer); recognition usually €100–600',
      'Виза 75 €; ускоренная процедура 411 € (обычно платит работодатель); признание обычно 100–600 €',
      'Vize 75 €; hızlandırılmış prosedür 411 € (genellikle işveren öder); tanınma genellikle 100–600 €',
      'Віза 75 €; прискорена процедура 411 € (зазвичай платить роботодавець); визнання зазвичай 100–600 €',
    ),
    pl: l6(
      'İş icazəsi 200–400 PLN; D vizası 2026-dan 200 € (konsulluqda yoxlayın); yaşayış icazəsi 440 PLN + kart 100 PLN',
      'Arbeitserlaubnis 200–400 PLN; D-Visum ab 2026: 200 € (beim Konsulat prüfen); Aufenthaltstitel 440 PLN + Karte 100 PLN',
      'Work permit PLN 200–400; D visa €200 from 2026 (check with the consulate); residence permit PLN 440 + card PLN 100',
      'Разрешение на работу 200–400 PLN; виза D с 2026 — 200 € (уточните в консульстве); ВНЖ 440 PLN + карта 100 PLN',
      'Çalışma izni 200–400 PLN; D vizesi 2026’dan itibaren 200 € (konsoloslukta kontrol edin); oturma izni 440 PLN + kart 100 PLN',
      'Дозвіл на роботу 200–400 PLN; віза D з 2026 — 200 € (уточніть у консульстві); посвідка 440 PLN + картка 100 PLN',
    ),
    cz: l6(
      'Çexiyada müraciətdə 2 500 CZK (≈ 100 €); səfirlik rüsumları XİN cədvəlinə görə',
      '2.500 CZK (≈ 100 €) bei Antrag in Tschechien; Botschaftsgebühren nach Tarif des Außenministeriums',
      'CZK 2,500 (≈ €100) when filed in Czechia; embassy fees per the foreign ministry schedule',
      '2 500 CZK (≈ 100 €) при подаче в Чехии; сборы посольства по тарифу МИД',
      'Çekya’da başvuruda 2.500 CZK (≈ 100 €); büyükelçilik ücretleri dışişleri tarifesine göre',
      '2 500 CZK (≈ 100 €) при подачі в Чехії; збори посольства за тарифом МЗС',
    ),
    uk: l6(
      'Viza 819–1 618 £ + tibbi sığorta rüsumu (IHS) ildə 1 035 £; işəgötürən Immigration Skills Charge ödəyir',
      'Visum 819–1.618 £ + Gesundheitszuschlag (IHS) 1.035 £ pro Jahr; Arbeitgeber zahlt Immigration Skills Charge',
      'Visa £819–1,618 + Immigration Health Surcharge £1,035 per year; employer pays the Immigration Skills Charge',
      'Виза 819–1 618 £ + медицинский сбор (IHS) 1 035 £ в год; работодатель платит Immigration Skills Charge',
      'Vize 819–1.618 £ + sağlık ek ücreti (IHS) yılda 1.035 £; işveren Immigration Skills Charge öder',
      'Віза 819–1 618 £ + медичний збір (IHS) 1 035 £ на рік; роботодавець платить Immigration Skills Charge',
    ),
    at: l6('Ərizə rüsumu təxminən 218 €', 'Antragsgebühr rund 218 €', 'Application fee about €218', 'Сбор за заявление около 218 €', 'Başvuru ücreti yaklaşık 218 €', 'Збір за заяву близько 218 €'),
  },
  language: {
    de: l6(
      '§ 18a / § 18b və Mavi Kart üçün ümumi minimum yoxdur; işəgötürənlər çox vaxt A2–B1 gözləyir; tibb bacısı kimi tənzimlənən peşələrdə B1–B2',
      'Für § 18a / § 18b und Blaue Karte kein allgemeines Minimum; Arbeitgeber erwarten oft A2–B1; reglementierte Berufe wie Pflege B1–B2',
      'No general minimum for § 18a / § 18b and the Blue Card; employers often expect A2–B1; regulated jobs such as nursing B1–B2',
      'Для § 18a / § 18b и Голубой карты общего минимума нет; работодатели часто ждут A2–B1; в регулируемых профессиях (медсестра) B1–B2',
      '§ 18a / § 18b ve Mavi Kart için genel asgari yok; işverenler çoğu zaman A2–B1 bekler; hemşirelik gibi düzenlenmiş mesleklerde B1–B2',
      'Для § 18a / § 18b і Блакитної карти загального мінімуму немає; роботодавці часто чекають A2–B1; у регульованих професіях (медсестра) B1–B2',
    ),
    pl: l6('İş icazəsi üçün tələb yoxdur', 'Für die Arbeitserlaubnis keine', 'None for a work permit', 'Для разрешения на работу не требуется', 'Çalışma izni için gerekmez', 'Для дозволу на роботу не потрібна'),
    cz: l6(
      'İşçi kartı üçün yoxdur; daimi yaşayış üçün çex dili A2',
      'Für die Arbeitnehmerkarte keine; Tschechisch A2 für den Daueraufenthalt',
      'None for the employee card; Czech A2 for permanent residence',
      'Для карты сотрудника не требуется; чешский A2 для ПМЖ',
      'Çalışan kartı için yok; kalıcı oturum için Çekçe A2',
      'Для картки працівника не потрібна; чеська A2 для ПМП',
    ),
    uk: l6(
      '8 yanvar 2026-dan yeni müraciətlər üçün ingilis dili B2',
      'Englisch B2 für neue Anträge ab 8. Januar 2026',
      'English B2 for new applications from 8 January 2026',
      'Английский B2 для новых заявлений с 8 января 2026',
      '8 Ocak 2026’dan itibaren yeni başvurular için İngilizce B2',
      'Англійська B2 для нових заяв з 8 січня 2026',
    ),
    at: l6(
      'Alman / ingilis dili üçün xal verilir, sabit minimum yoxdur; uzunmüddətli yaşayış üçün sonradan alman dili B1',
      'Punkte für Deutsch / Englisch, kein festes Minimum; Deutsch B1 später für den Daueraufenthalt',
      'Points for German / English, no fixed minimum; German B1 later for long-term residence',
      'Баллы за немецкий / английский, твёрдого минимума нет; позже немецкий B1 для долгосрочного ВНЖ',
      'Almanca / İngilizce için puan, sabit asgari yok; uzun süreli oturum için sonradan Almanca B1',
      'Бали за німецьку / англійську, твердого мінімуму немає; згодом німецька B1 для довгострокового проживання',
    ),
  },
  family: {
    de: l6(
      'Həyat yoldaşı və uşaqlar dərhal gələ bilər (gəlir və mənzil); mütəxəssis və Mavi Kart sahiblərinin həyat yoldaşından alman dili tələb olunmur',
      'Ehepartner und Kinder können sofort nachkommen (Einkommen und Wohnraum); bei Fachkräften und Blauer Karte kein Deutschnachweis für den Ehepartner',
      'Spouse and children can join at once (income and housing); no German required from spouses of skilled workers and Blue Card holders',
      'Супруг и дети могут приехать сразу (доход и жильё); от супругов специалистов и владельцев Голубой карты немецкий не требуется',
      'Eş ve çocuklar hemen gelebilir (gelir ve konut); nitelikli işçi ve Mavi Kart sahiplerinin eşlerinden Almanca istenmez',
      'Чоловік / дружина та діти можуть приїхати одразу (дохід і житло); від подружжя фахівців і власників Блакитної карти німецька не потрібна',
    ),
    pl: l6(
      'Adətən dərhal yox: sponsor yaşayış icazəsinə və müəyyən qalış müddətinə malik olmalıdır; Mavi Kart sahibləri — dərhal',
      'Meist nicht sofort: Bezugsperson braucht Aufenthaltstitel und eine Mindestaufenthaltsdauer; Blaue Karte sofort',
      'Usually not at once: the sponsor needs a residence permit and a minimum period of residence; Blue Card holders immediately',
      'Обычно не сразу: спонсору нужен ВНЖ и минимальный срок пребывания; владельцам Голубой карты — сразу',
      'Genellikle hemen değil: sponsorun oturma izni ve asgari kalış süresi olmalı; Mavi Kart sahipleri hemen',
      'Зазвичай не одразу: спонсору потрібні посвідка та мінімальний строк проживання; власникам Блакитної карти — одразу',
    ),
    cz: l6(
      'Adətən sponsorun 15 aylıq qalışından sonra (bəzi kart sahibləri üçün daha qısa — yoxlayın); qərar 270 günə qədər',
      'Meist nach 15 Monaten Aufenthalt der Bezugsperson (für manche Karteninhaber kürzer — prüfen); Entscheidung bis 270 Tage',
      'Usually after the sponsor’s 15 months of residence (shorter for some card holders — check); decision up to 270 days',
      'Обычно после 15 месяцев пребывания спонсора (для некоторых держателей карт короче — проверьте); решение до 270 дней',
      'Genellikle sponsorun 15 aylık kalışından sonra (bazı kart sahipleri için daha kısa — kontrol edin); karar 270 güne kadar',
      'Зазвичай після 15 місяців проживання спонсора (для деяких власників карток коротше — перевірте); рішення до 270 днів',
    ),
    uk: l6(
      'Həyat yoldaşı və uşaqlar mümkündür; 2025-ci ilin iyulundan ali təhsil səviyyəsindən aşağı yeni işlər üçün məhdudlaşdırılıb (gov.uk-da yoxlayın)',
      'Partner und Kinder möglich; seit Juli 2025 für neue Stellen unter Hochschulniveau eingeschränkt (auf gov.uk prüfen)',
      'Partner and children possible; restricted for new jobs below degree level since July 2025 (check gov.uk)',
      'Супруг и дети возможны; с июля 2025 ограничено для новых должностей ниже уровня вуза (проверьте на gov.uk)',
      'Eş ve çocuklar mümkün; Temmuz 2025’ten beri üniversite düzeyinin altındaki yeni işler için kısıtlı (gov.uk’ta kontrol edin)',
      'Партнер і діти можливі; з липня 2025 обмежено для нових посад нижче рівня ЗВО (перевірте на gov.uk)',
    ),
    at: l6(
      '“Rot-Weiß-Rot-Karte plus”; adətən gəlişdən əvvəl alman dili A1 (Mavi Kart sahibləri istisnadır)',
      '„Rot-Weiß-Rot-Karte plus“; meist Deutsch A1 vor der Einreise (Ausnahme u. a. Blaue Karte)',
      '“Red-White-Red Card plus”; usually German A1 before arrival (exceptions include the Blue Card)',
      '«Rot-Weiß-Rot-Karte plus»; обычно немецкий A1 до въезда (исключения — в т. ч. Голубая карта)',
      '“Rot-Weiß-Rot-Karte plus”; genellikle girişten önce Almanca A1 (Mavi Kart gibi istisnalar var)',
      '«Rot-Weiß-Rot-Karte plus»; зазвичай німецька A1 до вʼїзду (винятки — зокрема Блакитна карта)',
    ),
  },
  settlement: {
    de: l6(
      'Mütəxəssis kimi 3 ildən sonra Niederlassungserlaubnis (§ 18c); Mavi Kart: 27 ay, B1 ilə 21 ay',
      'Niederlassungserlaubnis nach 3 Jahren als Fachkraft (§ 18c); Blaue Karte: 27 Monate, mit B1 21 Monate',
      'Settlement permit after 3 years as a skilled worker (§ 18c); Blue Card: 27 months, 21 with B1',
      'ПМЖ (Niederlassungserlaubnis) через 3 года как специалист (§ 18c); Голубая карта: 27 месяцев, с B1 — 21',
      'Nitelikli işçi olarak 3 yıl sonra süresiz oturum (§ 18c); Mavi Kart: 27 ay, B1 ile 21 ay',
      'ПМП (Niederlassungserlaubnis) через 3 роки як фахівець (§ 18c); Блакитна карта: 27 місяців, з B1 — 21',
    ),
    pl: l6('5 ildən sonra AB uzunmüddətli rezident statusu', 'Daueraufenthalt-EU nach 5 Jahren', 'EU long-term residence after 5 years', 'Статус долгосрочного резидента ЕС через 5 лет', '5 yıl sonra AB uzun süreli ikamet', 'Статус довгострокового резидента ЄС через 5 років'),
    cz: l6('5 ildən sonra daimi yaşayış', 'Daueraufenthalt nach 5 Jahren', 'Permanent residence after 5 years', 'ПМЖ через 5 лет', '5 yıl sonra kalıcı oturum', 'ПМП через 5 років'),
    uk: l6(
      'Hazırda 5 ildən sonra ILR; noyabr 2026-da 10 il əsas müddətli “earned settlement” elan olunub, 2027-dən mərhələli (keçid qaydaları gözlənilir)',
      'Derzeit ILR nach 5 Jahren; im November 2026 angekündigt: „earned settlement“ mit 10 Jahren als Regel, gestaffelt ab 2027 (Übergangsregeln offen)',
      'ILR after 5 years today; “earned settlement” with a 10-year default announced in November 2026, phased in from 2027 (transition rules pending)',
      'Сейчас ILR через 5 лет; в ноябре 2026 объявлен «earned settlement» с 10 годами по умолчанию, поэтапно с 2027 (переходные правила ещё не известны)',
      'Bugün 5 yıl sonra ILR; Kasım 2026’da varsayılan 10 yıllık “earned settlement” duyuruldu, 2027’den itibaren kademeli (geçiş kuralları belirsiz)',
      'Зараз ILR через 5 років; у листопаді 2026 оголошено «earned settlement» з 10 роками за замовчуванням, поетапно з 2027 (перехідні правила ще невідомі)',
    ),
    at: l6(
      '5 ildən sonra “Daueraufenthalt – EU” + alman dili B1',
      '„Daueraufenthalt – EU“ nach 5 Jahren + Deutsch B1',
      '“Long-term resident – EU” after 5 years + German B1',
      '«Daueraufenthalt – EU» через 5 лет + немецкий B1',
      '5 yıl sonra “Daueraufenthalt – EU” + Almanca B1',
      '«Daueraufenthalt – EU» через 5 років + німецька B1',
    ),
  },
  citizenship: {
    de: l6(
      '5 ildən sonra, alman dili B1 (3 illik sürətli yol 2025-ci ilin oktyabrında ləğv edilib); Almaniya ikili vətəndaşlığa icazə verir — Azərbaycan qaydalarını ayrıca yoxlayın',
      'Nach 5 Jahren, Deutsch B1 (3-Jahres-Turbo seit Oktober 2025 abgeschafft); Deutschland erlaubt Mehrstaatigkeit — aserbaidschanische Regeln gesondert prüfen',
      'After 5 years, German B1 (the 3-year fast track was abolished in October 2025); Germany allows dual citizenship — check Azerbaijan’s rules separately',
      'Через 5 лет, немецкий B1 (ускоренный путь за 3 года отменён в октябре 2025); Германия допускает двойное гражданство — правила Азербайджана проверьте отдельно',
      '5 yıl sonra, Almanca B1 (3 yıllık hızlı yol Ekim 2025’te kaldırıldı); Almanya çifte vatandaşlığa izin verir — Azerbaycan kurallarını ayrıca kontrol edin',
      'Через 5 років, німецька B1 (прискорений шлях за 3 роки скасовано в жовтні 2025); Німеччина дозволяє подвійне громадянство — правила Азербайджану перевірте окремо',
    ),
    pl: l6(
      'Təxminən 8 il cəmi (daimi statusdan 3 il sonra + polyak dili B1); daha uzun müddətlər üçün islahat müzakirə olunur',
      'Insgesamt etwa 8 Jahre (3 Jahre nach Daueraufenthalt + Polnisch B1); Reform mit längeren Fristen in Beratung',
      'About 8 years in total (3 years after permanent status + Polish B1); a reform with longer periods is under discussion',
      'Около 8 лет в сумме (3 года после постоянного статуса + польский B1); обсуждается реформа с более долгими сроками',
      'Toplam yaklaşık 8 yıl (kalıcı statüden 3 yıl sonra + Lehçe B1); daha uzun süreler için reform görüşülüyor',
      'Близько 8 років загалом (3 роки після постійного статусу + польська B1); обговорюється реформа з довшими строками',
    ),
    cz: l6(
      'Adətən 5 il daimi yaşayışdan sonra (≈ 10 il cəmi); çex dili B1 + vətəndaşlıq testi',
      'In der Regel 5 Jahre Daueraufenthalt (≈ 10 Jahre insgesamt); Tschechisch B1 + Landeskundetest',
      'Usually 5 years of permanent residence (≈ 10 years in total); Czech B1 + civics test',
      'Обычно 5 лет ПМЖ (≈ 10 лет в сумме); чешский B1 + тест по обществоведению',
      'Genellikle 5 yıl kalıcı oturum (≈ toplam 10 yıl); Çekçe B1 + yurttaşlık testi',
      'Зазвичай 5 років ПМП (≈ 10 років загалом); чеська B1 + тест із громадянознавства',
    ),
    uk: l6('Adətən ILR-dən 12 ay sonra', 'Meist 12 Monate nach ILR', 'Usually 12 months after ILR', 'Обычно через 12 месяцев после ILR', 'Genellikle ILR’den 12 ay sonra', 'Зазвичай через 12 місяців після ILR'),
    at: l6(
      'Adətən 10 il (xüsusi hallarda daha qısa)',
      'In der Regel 10 Jahre (in Sonderfällen kürzer)',
      'Normally 10 years (shorter in special cases)',
      'Обычно 10 лет (в особых случаях короче)',
      'Genellikle 10 yıl (özel durumlarda daha kısa)',
      'Зазвичай 10 років (в особливих випадках коротше)',
    ),
  },
  priceLevel: {
    de: l6('108,3', '108,3', '108.3', '108,3', '108,3', '108,3'),
    pl: l6('73,3', '73,3', '73.3', '73,3', '73,3', '73,3'),
    cz: l6('89,4', '89,4', '89.4', '89,4', '89,4', '89,4'),
    uk: l6('123,3', '123,3', '123.3', '123,3', '123,3', '123,3'),
    at: l6('113,0', '113,0', '113.0', '113,0', '113,0', '113,0'),
  },
  schengen: {
    de: l6('Bəli', 'Ja', 'Yes', 'Да', 'Evet', 'Так'),
    pl: l6('Bəli', 'Ja', 'Yes', 'Да', 'Evet', 'Так'),
    cz: l6('Bəli', 'Ja', 'Yes', 'Да', 'Evet', 'Так'),
    uk: l6(
      'Xeyr — Britaniya vizası Şengenə səyahət hüququ vermir',
      'Nein — ein britisches Visum erlaubt keine Schengen-Reisen',
      'No — a UK visa gives no Schengen travel',
      'Нет — британская виза не даёт поездок по Шенгену',
      'Hayır — Birleşik Krallık vizesi Schengen seyahati sağlamaz',
      'Ні — британська віза не дає поїздок Шенгеном',
    ),
    at: l6('Bəli', 'Ja', 'Yes', 'Да', 'Evet', 'Так'),
  },
};

/** Cells where the country is clearly the strongest for our workers (highlighted, never a "winner" claim). */
export const STRONG: Partial<Record<Criterion, Country[]>> = {
  route: ['de'],
  family: ['de'],
  settlement: ['de'],
  citizenship: ['de'],
  priceLevel: ['pl'],
  minWage: ['de', 'uk'],
  processing: ['uk'],
  language: ['pl', 'cz'],
};

export const PROFESSIONS = ['driver', 'nurse', 'cook', 'electrician', 'construction'] as const;
export type Profession = (typeof PROFESSIONS)[number];

/**
 * Typical gross monthly pay, € (ESTIMATES, rounded). Germany: the entry-level orientation ranges the site uses
 * everywhere (Entgeltatlas of the Federal Employment Agency, server/src/lib/publicAi/pathFinder.ts REFERENCE_GROSS);
 * Poland: GUS medians October 2024 (PLN → € at 4.25) ± about 8 %; Czechia: ČSÚ / ISPV 2025 medians of the
 * nearest group (drivers, manual workers, accommodation & food, all employees for nurses) at 24.3 CZK/€ ± 8 %;
 * UK: ONS ASHE 2026 provisional medians (£ → € at 0.87); Austria: rough estimate from collective agreements,
 * per payment (14 a year) — no official occupation median was found.
 */
export const SALARY: Record<Profession, Record<Country, [number, number]>> = {
  driver: { de: [2800, 3600], pl: [1600, 1850], cz: [1550, 1800], uk: [3800, 4200], at: [2400, 2900] },
  nurse: { de: [2900, 3900], pl: [2300, 2700], cz: [1700, 1950], uk: [4000, 4550], at: [3000, 3800] },
  cook: { de: [2450, 3000], pl: [1150, 1400], cz: [1000, 1150], uk: [2500, 3200], at: [2100, 2600] },
  electrician: { de: [3000, 3900], pl: [1700, 2000], cz: [1400, 1650], uk: [3700, 4100], at: [2700, 3300] },
  construction: { de: [2700, 3500], pl: [1300, 1750], cz: [1400, 1650], uk: [3150, 3450], at: [2700, 3200] },
};

/** Salary payments per year (Austria pays a 13th and 14th salary). */
export const PAYMENTS: Record<Country, number> = { de: 12, pl: 12, cz: 12, uk: 12, at: 14 };

/** Rough net share of gross for a single person without children at these wages (ESTIMATE). */
export const NET_RATIO: Record<Country, number> = { de: 0.65, pl: 0.72, cz: 0.79, uk: 0.8, at: 0.72 };

export type Eligibility = 'yes' | 'shortageOnly';
/** UK Skilled Worker eligibility of the profession since 22 July 2025 (degree level RQF 6 or a shortage list). */
export const UK_ELIGIBLE: Record<Profession, Eligibility> = {
  driver: 'shortageOnly',
  nurse: 'yes',
  cook: 'shortageOnly',
  electrician: 'shortageOnly',
  construction: 'shortageOnly',
};

/** Net estimate of a gross amount. */
export const netOf = (gross: number, c: Country) => Math.round((gross * NET_RATIO[c]) / 10) * 10;
/** Yearly gross of a monthly amount (14 payments in Austria). */
export const yearlyOf = (monthly: number, c: Country) => monthly * PAYMENTS[c];

export const COUNTRY_SOURCES: { label: string; url: string }[] = [
  { label: 'Bundesregierung – Mindestlohn 2026/2027', url: 'https://www.bundesregierung.de/breg-de/aktuelles/mindestlohn-steigt-2391010' },
  { label: 'gesetze-im-internet.de – § 18c AufenthG (Niederlassungserlaubnis)', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__18c.html' },
  { label: 'Bundesregierung – Einbürgerung (Turbo-Einbürgerung abgeschafft)', url: 'https://www.bundesregierung.de/breg-de/service/fragen-und-anworten/kabinett-einbuergerung-2350620' },
  { label: 'Make it in Germany – Visa und Aufenthalt', url: 'https://www.make-it-in-germany.com/de/' },
  { label: 'Bundesagentur für Arbeit – Entgeltatlas', url: 'https://web.arbeitsagentur.de/entgeltatlas/' },
  { label: 'Deutsche Botschaft Baku – Gebühren', url: 'https://baku.diplo.de/az-de/konsularservice/visa-und-einreise/gebuehren-2020214' },
  { label: 'Dziennik Ustaw 2025 poz. 1242 – płaca minimalna 2026', url: 'https://dziennikustaw.gov.pl/D2025000124201.pdf' },
  { label: 'gov.pl – D-type national visa', url: 'https://www.gov.pl/web/malta-en/d-type-national-visa' },
  { label: 'GUS – Struktura wynagrodzeń według zawodów (X 2024)', url: 'https://stat.gov.pl/obszary-tematyczne/rynek-pracy/pracujacy-zatrudnieni-wynagrodzenia-koszty-pracy/struktura-wynagrodzen-wedlug-zawodow-za-pazdziernik-2024-r-,5,9.html' },
  { label: 'MPSV – Minimální mzda', url: 'https://mpsv.gov.cz/minimalni-mzda' },
  { label: 'MZV – Program Kvalifikovaný zaměstnanec', url: 'https://mzv.gov.cz/jnp/cz/informace_pro_cizince/pobytova_opravneni_k_pobytu_nad_90_dnu/rezimy/rozsireni_pilotniho_projektu_ukrajina.html' },
  { label: 'MZV – Sloučení rodiny', url: 'https://mzv.gov.cz/jnp/cz/informace_pro_cizince/pobytova_opravneni_k_pobytu_nad_90_dnu/slouceni_rodiny_1.html' },
  { label: 'ISPV – Informační systém o průměrném výdělku', url: 'https://www.ispv.cz' },
  { label: 'GOV.UK – National Minimum Wage rates', url: 'https://www.gov.uk/national-minimum-wage-rates' },
  { label: 'GOV.UK – Skilled Worker visa: your job', url: 'https://www.gov.uk/skilled-worker-visa/your-job' },
  { label: 'GOV.UK – Skilled Worker visa: how much it costs', url: 'https://www.gov.uk/skilled-worker-visa/how-much-it-costs' },
  { label: 'GOV.UK – English language requirement levels', url: 'https://www.gov.uk/government/publications/english-language-requirement-levels-for-immigration-applications/english-language-requirement-levels-for-immigration-applications' },
  { label: 'ONS – Annual Survey of Hours and Earnings (ASHE)', url: 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours' },
  { label: 'GOV.UK – Immigration Skills Charge', url: 'https://www.gov.uk/uk-visa-sponsorship-employers/immigration-skills-charge' },
  { label: 'migration.gv.at – Fachkräfte in Mangelberufen', url: 'https://www.migration.gv.at/de/formen-der-zuwanderung/dauerhafte-zuwanderung/fachkraefte-in-mangelberufen/' },
  { label: 'oesterreich.gv.at – Rot-Weiß-Rot-Karte', url: 'https://www.oesterreich.gv.at/de/themen/menschen_aus_anderen_staaten/aufenthalt/3/2/2/Seite.120231' },
  { label: 'oesterreich.gv.at – Daueraufenthalt EU', url: 'https://www.oesterreich.gv.at/de/themen/menschen_aus_anderen_staaten/aufenthalt/3/2/Seite.120402' },
  { label: 'Eurostat – Price level indices (tec00120)', url: 'https://ec.europa.eu/eurostat/databrowser/view/tec00120/default/table' },
];

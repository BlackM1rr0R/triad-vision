import type { LocalizedContent } from './types';

/**
 * Text under the "Life in Germany" simulator (/life-in-germany). Money figures are {{placeholders}} the page fills
 * from the API (Deutschlandticket, Rundfunkbeitrag, Kindergeld from server/src/lib/budget/params.ts via
 * /api/life/config, the national average wage from the admin setting), so the article and the simulator agree.
 * Facts: Deutschlandticket = local and regional public transport in all of Germany, not long-distance trains;
 * Rundfunkbeitrag per flat, not per person; tax class III/V or IV/IV for married couples; Kindergeld per child.
 */
export const LIFE_VARS = ['ticket', 'rundfunk', 'kindergeld', 'avgAzn', 'avgYear', 'checked'] as const;

export const lifeContent: LocalizedContent = {
  az: {
    eyebrow: 'Almaniyada həyat: rəqəmlərlə',
    sections: [
      {
        id: 'hesab',
        h2: 'Simulyator necə hesablayır?',
        blocks: [
          'Simulyator peşənizin tipik brutto maaşından başlayır: saytımızdakı açıq vakansiyalar kifayət qədərdirsə, onların maaş aralığından, deyilsə Federal Məşğulluq Agentliyinin Entgeltatlas göstəricilərinə əsaslanan istinad cədvəlindən. Sonra xalis maaş rəsmi vergi düsturu və sosial sığorta dərəcələri ilə hesablanır — seçdiyiniz vergi sinfinə görə.',
          { ul: [
            '**Kirayə**: seçdiyiniz şəhər və ailə ölçüsü üçün orta kirayə (tək: bir otaqlı mənzil və ya WG otağı, ailə: iki otaqlı mənzil).',
            '**Kommunal xərclər**: elektrik və radio-televiziya haqqı (Rundfunkbeitrag, mənzil başına ayda {{rundfunk}}); istilik və su kirayəyə daxildir.',
            '**Ərzaq**: şəhərdəki orta qiymətlərlə, uşaqlar üçün daha az.',
            '**Nəqliyyat**: hər böyük üçün bir Deutschlandticket — ayda {{ticket}}.',
            '**Telefon və internet**, **sığorta** (şəxsi məsuliyyət, mənzil üçün əmlak sığortası), **şəxsi xərclər** (geyim, istirahət, uşaq xərcləri).',
          ] },
          'Nəticə — ayın sonunda qalan pul. Bütün rəqəmlər aralıq kimi verilir: diaqram aralığın ortasını göstərir.',
        ],
      },
      {
        id: 'manat',
        h2: 'Avro və manat',
        blocks: [
          'Manatla olan məbləğlər Azərbaycan Mərkəzi Bankının (AMB) rəsmi avro məzənnəsi ilə hesablanır. Məzənnə gündə bir dəfə yenilənir və tarixi ilə göstərilir. Bankda və ya köçürmə xidmətində pul dəyişəndə məzənnə bir qədər fərqli olacaq — manat məbləğləri yalnız müqayisə üçündür.',
        ],
      },
      {
        id: 'baki',
        h2: 'Bakı ilə müqayisə',
        blocks: [
          'Dövlət Statistika Komitəsinin məlumatına görə Azərbaycanda orta aylıq nominal (brutto) əmək haqqı {{avgAzn}} olub ({{avgYear}}) — bu, bütün peşələr və bütün ölkə üzrə ortadır, konkret peşənin Bakıdakı maaşı deyil. Komandamız bəzi peşələr üçün öz təxminini daxil edə bilər; səhifədə hər rəqəmin mənbəyi yazılır.',
          'Brutto maaşları birbaşa müqayisə etmək aldadıcıdır: Almaniyada vergilər və qiymətlər daha yüksəkdir. Daha düzgün sual: bütün xərclərdən sonra ayda nə qədər pul qalır və bu, Bakıdakı neçə aylıq maaşa bərabərdir?',
        ],
      },
      {
        id: 'qenaet',
        h2: 'Necə daha çox qənaət etmək olar?',
        blocks: [
          { ul: [
            'İlk aylarda WG otağı ayrıca mənzildən xeyli ucuzdur.',
            'Evlisinizsə və həyat yoldaşınız az qazanırsa və ya işləmirsə, III vergi sinfi xalis maaşı artırır.',
            'Hər uşaq üçün ayda {{kindergeld}} uşaq pulu (Kindergeld) verilir — ərizəni Familienkasse-yə verin.',
            'Endirimli marketlər (Aldi, Lidl, Penny, Netto) və Deutschlandticket ilə avtomobilsiz yaşamaq xərcləri xeyli azaldır.',
          ] },
        ],
      },
    ],
    faqTitle: 'Almaniyada həyat haqqında suallar',
    faq: [
      { q: 'Almaniyada adi maaşdan nə qədər pul qalır?', a: 'Peşədən, şəhərdən və ailədən asılıdır. Tək yaşayan sürücü və ya tibb bacısı orta ölçülü şəhərdə adətən ayda bir neçə yüz avro qənaət edə bilir; Münhen kimi bahalı şəhərdə və ya tək maaşla yaşayan ailədə qalan pul az ola bilər. Simulyatorda öz variantınızı yoxlayın.' },
      { q: 'Evli olanlar hansı vergi sinfini seçməlidir?', a: 'Yalnız biri işləyirsə və ya biri xeyli az qazanırsa, adətən III/V, hər ikisi oxşar qazanırsa IV/IV. İl sonunda vergi bəyannaməsi ilə fərq düzəlir, amma aylıq xalis maaş sinifdən asılıdır.' },
      { q: 'Deutschlandticket hər yerdə keçərlidirmi?', a: 'Bütün Almaniyada şəhər və regional nəqliyyatda (metro, avtobus, tramvay, regional qatarlar) keçərlidir, sürətli şəhərlərarası qatarlarda (ICE, IC) isə yox. Abunə aylıqdır və hər ay ləğv edilə bilər.' },
      { q: 'Manat məbləğləri nə qədər dəqiqdir?', a: 'AMB-nin rəsmi məzənnəsi ilə hesablanır və tarix göstərilir. Pul köçürəndə bankın məzənnəsi və komissiyası fərqli olacaq, ona görə manat rəqəmləri təxminidir.' },
      { q: 'Kirayə rəqəmləri haradan götürülür?', a: 'Hər şəhər üçün komandamızın yoxladığı və mütəmadi yenilədiyi orta qiymətlərdən (kirayə indeksləri və elanlar). Konkret mənzilin qiyməti rayondan və vəziyyətdən asılı olaraq fərqlənə bilər.' },
    ],
    sources: 'Vəziyyət: {{checked}}. Mənbələr: rəsmi vergi düsturu (Lohnsteuer PAP 2026), sosial sığorta dərəcələri 2026, Azərbaycan Mərkəzi Bankı (məzənnə), Dövlət Statistika Komitəsi (orta əmək haqqı), şəhərlər üzrə orta kirayə və qiymətlər. Hesablama təxminidir, vergi və ya hüquqi məsləhət deyil.',
  },
  de: {
    eyebrow: 'Leben in Deutschland in Zahlen',
    sections: [
      {
        id: 'hesab',
        h2: 'Wie rechnet der Simulator?',
        blocks: [
          'Der Simulator startet beim typischen Bruttogehalt Ihres Berufs: aus den Gehaltsspannen unserer offenen Stellen, wenn es genug davon gibt, sonst aus einer Referenztabelle nach dem Entgeltatlas der Bundesagentur für Arbeit. Das Netto rechnet er mit der amtlichen Lohnsteuerformel und den Sozialversicherungsbeiträgen — für die gewählte Steuerklasse.',
          { ul: [
            '**Miete**: Durchschnittsmiete der gewählten Stadt für Ihre Haushaltsgröße (allein: 1-Zimmer-Wohnung oder WG-Zimmer, Familie: 2-Zimmer-Wohnung).',
            '**Nebenkosten**: Strom und Rundfunkbeitrag ({{rundfunk}} pro Monat und Wohnung); Heizung und Wasser stecken in der Warmmiete.',
            '**Lebensmittel**: Durchschnittspreise der Stadt, für Kinder weniger.',
            '**Mobilität**: ein Deutschlandticket je Erwachsenem — {{ticket}} im Monat.',
            '**Handy und Internet**, **Versicherungen** (Haftpflicht, Hausrat bei eigener Wohnung) und **Persönliches** (Kleidung, Freizeit, Kosten für Kinder).',
          ] },
          'Ergebnis ist, was am Monatsende übrig bleibt. Alle Werte sind Spannen; das Diagramm zeigt jeweils die Mitte.',
        ],
      },
      {
        id: 'manat',
        h2: 'Euro und Manat',
        blocks: [
          'Die Manat-Beträge rechnen wir mit dem amtlichen Euro-Kurs der Zentralbank Aserbaidschans (CBAR) um. Der Kurs wird einmal täglich aktualisiert und mit Datum angezeigt. Beim Umtausch oder einer Überweisung gilt der Kurs Ihrer Bank — die Manat-Werte dienen dem Vergleich.',
        ],
      },
      {
        id: 'baki',
        h2: 'Vergleich mit Baku',
        blocks: [
          'Laut Staatlichem Statistikkomitee lag der durchschnittliche nominale Bruttomonatslohn in Aserbaidschan {{avgYear}} bei {{avgAzn}} — ein Durchschnitt über alle Berufe und das ganze Land, nicht das Gehalt eines bestimmten Berufs in Baku. Unser Team kann für einzelne Berufe eigene Schätzungen hinterlegen; die Quelle steht jeweils dabei.',
          'Bruttogehälter direkt zu vergleichen täuscht: In Deutschland sind Abgaben und Preise höher. Aussagekräftiger ist, was nach allen Kosten im Monat übrig bleibt — und wie vielen Monatsgehältern in Baku das entspricht.',
        ],
      },
      {
        id: 'qenaet',
        h2: 'So sparen Sie mehr',
        blocks: [
          { ul: [
            'Ein WG-Zimmer ist in den ersten Monaten deutlich günstiger als eine eigene Wohnung.',
            'Verheiratet und Ihr Partner verdient wenig oder nichts? Steuerklasse III erhöht das monatliche Netto.',
            'Für jedes Kind gibt es {{kindergeld}} Kindergeld im Monat — Antrag bei der Familienkasse.',
            'Discounter (Aldi, Lidl, Penny, Netto) und ein Leben ohne Auto mit dem Deutschlandticket senken die Kosten spürbar.',
          ] },
        ],
      },
    ],
    faqTitle: 'Fragen zum Leben in Deutschland',
    faq: [
      { q: 'Wie viel bleibt von einem normalen Gehalt übrig?', a: 'Das hängt von Beruf, Stadt und Haushalt ab. Alleinstehende Berufskraftfahrer oder Pflegekräfte sparen in einer mittelgroßen Stadt oft einige hundert Euro im Monat; in teuren Städten wie München oder bei einer Familie mit einem Einkommen kann wenig übrig bleiben. Prüfen Sie Ihre Variante im Simulator.' },
      { q: 'Welche Steuerklasse für Verheiratete?', a: 'Verdient nur einer oder einer deutlich weniger, meist III/V, bei ähnlichem Einkommen IV/IV. Mit der Steuererklärung gleicht sich die Jahressteuer an, das monatliche Netto hängt aber von der Klasse ab.' },
      { q: 'Gilt das Deutschlandticket überall?', a: 'Im gesamten Nah- und Regionalverkehr in ganz Deutschland (U-Bahn, Bus, Straßenbahn, Regionalzüge), nicht im Fernverkehr (ICE, IC). Es ist ein monatlich kündbares Abo.' },
      { q: 'Wie genau sind die Manat-Beträge?', a: 'Sie beruhen auf dem amtlichen CBAR-Kurs mit Datum. Bei einer Überweisung gelten Kurs und Gebühren Ihrer Bank, daher sind die Manat-Werte Näherungen.' },
      { q: 'Woher stammen die Mietwerte?', a: 'Aus Durchschnittswerten je Stadt (Mietspiegel, Inserate), die unser Team prüft und regelmäßig aktualisiert. Eine konkrete Wohnung kann je nach Lage und Zustand deutlich abweichen.' },
    ],
    sources: 'Stand: {{checked}}. Quellen: Lohnsteuer-Programmablaufplan 2026, Sozialversicherungswerte 2026, Zentralbank Aserbaidschans (Kurs), Staatliches Statistikkomitee Aserbaidschans (Durchschnittslohn), Durchschnittsmieten und -preise je Stadt. Unverbindliche Schätzung, keine Steuer- oder Rechtsberatung.',
  },
  en: {
    eyebrow: 'Life in Germany in numbers',
    sections: [
      {
        id: 'hesab',
        h2: 'How does the simulator calculate?',
        blocks: [
          'The simulator starts from the typical gross salary of your profession: from the salary ranges of our open vacancies when there are enough of them, otherwise from a reference table based on the Federal Employment Agency’s Entgeltatlas. It then computes the net salary with the official wage-tax formula and social insurance rates — for the tax class you choose.',
          { ul: [
            '**Rent**: the average rent of the chosen city for your household (single: one-room flat or WG room, family: two-room flat).',
            '**Utilities**: electricity and the broadcasting fee (Rundfunkbeitrag, {{rundfunk}} a month per flat); heating and water are part of the warm rent.',
            '**Food**: average prices of the city, less for children.',
            '**Transport**: one Deutschlandticket per adult — {{ticket}} a month.',
            '**Phone and internet**, **insurance** (personal liability, contents insurance for a flat) and **personal costs** (clothes, leisure, children).',
          ] },
          'The result is what is left at the end of the month. All figures are ranges; the chart shows the middle of each.',
        ],
      },
      {
        id: 'manat',
        h2: 'Euro and manat',
        blocks: [
          'Manat amounts use the official euro rate of the Central Bank of Azerbaijan (CBAR). The rate is updated once a day and shown with its date. When you exchange or transfer money, your bank’s rate applies — the manat figures are for comparison.',
        ],
      },
      {
        id: 'baki',
        h2: 'Compared with Baku',
        blocks: [
          'According to the State Statistical Committee, the average monthly nominal (gross) wage in Azerbaijan was {{avgAzn}} in {{avgYear}} — an average over all professions and the whole country, not the salary of a specific profession in Baku. Our team can enter its own estimate for single professions; the source is shown with every figure.',
          'Comparing gross salaries directly is misleading: taxes and prices are higher in Germany. The better question is what is left each month after all costs — and how many Baku monthly salaries that is.',
        ],
      },
      {
        id: 'qenaet',
        h2: 'How to save more',
        blocks: [
          { ul: [
            'A WG room is much cheaper than your own flat in the first months.',
            'Married and your partner earns little or nothing? Tax class III raises the monthly net.',
            'Each child brings {{kindergeld}} child benefit (Kindergeld) a month — apply at the Familienkasse.',
            'Discount supermarkets (Aldi, Lidl, Penny, Netto) and living without a car on the Deutschlandticket cut costs noticeably.',
          ] },
        ],
      },
    ],
    faqTitle: 'Questions about life in Germany',
    faq: [
      { q: 'How much is left of a normal salary in Germany?', a: 'It depends on profession, city and household. A single truck driver or nurse in a medium-sized city often saves a few hundred euros a month; in an expensive city like Munich, or for a family on one income, little may be left. Try your own case in the simulator.' },
      { q: 'Which tax class for married couples?', a: 'If only one partner works or one earns much less, usually III/V; with similar incomes IV/IV. The annual tax return evens out the year, but the monthly net depends on the class.' },
      { q: 'Is the Deutschlandticket valid everywhere?', a: 'On all local and regional public transport in Germany (underground, bus, tram, regional trains), not on long-distance trains (ICE, IC). It is a monthly subscription you can cancel each month.' },
      { q: 'How exact are the manat amounts?', a: 'They use the official CBAR rate, shown with its date. A transfer uses your bank’s rate and fees, so the manat figures are approximations.' },
      { q: 'Where do the rent figures come from?', a: 'From average values per city (rent indices, listings) that our team checks and updates regularly. A specific flat can differ a lot depending on the district and condition.' },
    ],
    sources: 'As of {{checked}}. Sources: official wage-tax formula (Lohnsteuer PAP 2026), social insurance values 2026, Central Bank of Azerbaijan (exchange rate), State Statistical Committee of Azerbaijan (average wage), average rents and prices per city. An estimate, not tax or legal advice.',
  },
  ru: {
    eyebrow: 'Жизнь в Германии в цифрах',
    sections: [
      {
        id: 'hesab',
        h2: 'Как считает симулятор?',
        blocks: [
          'Симулятор начинает с типичной зарплаты брутто вашей профессии: по диапазонам зарплат наших открытых вакансий, если их достаточно, иначе — по справочной таблице на основе Entgeltatlas Федерального агентства по труду. Затем нетто рассчитывается по официальной формуле подоходного налога и ставкам соцстрахования — для выбранного налогового класса.',
          { ul: [
            '**Аренда**: средняя аренда выбранного города для вашей семьи (один: однокомнатная квартира или комната в WG, семья: двухкомнатная квартира).',
            '**Коммунальные**: электричество и радиовещательный сбор (Rundfunkbeitrag, {{rundfunk}} в месяц на квартиру); отопление и вода входят в тёплую аренду.',
            '**Продукты**: средние цены города, для детей меньше.',
            '**Транспорт**: один Deutschlandticket на взрослого — {{ticket}} в месяц.',
            '**Телефон и интернет**, **страховки** (ответственность, имущество при своей квартире) и **личные расходы** (одежда, досуг, расходы на детей).',
          ] },
          'Результат — сколько остаётся в конце месяца. Все суммы — диапазоны; диаграмма показывает середину каждого.',
        ],
      },
      {
        id: 'manat',
        h2: 'Евро и манат',
        blocks: [
          'Суммы в манатах пересчитываются по официальному курсу евро Центрального банка Азербайджана (ЦБА). Курс обновляется раз в день и показывается с датой. При обмене или переводе действует курс вашего банка — суммы в манатах служат для сравнения.',
        ],
      },
      {
        id: 'baki',
        h2: 'Сравнение с Баку',
        blocks: [
          'По данным Государственного комитета по статистике, средняя номинальная (брутто) зарплата в Азербайджане в {{avgYear}} году составила {{avgAzn}} в месяц — это среднее по всем профессиям и всей стране, а не зарплата конкретной профессии в Баку. Наша команда может указать собственную оценку для отдельных профессий; у каждой цифры указан источник.',
          'Прямое сравнение зарплат брутто вводит в заблуждение: в Германии выше налоги и цены. Правильнее смотреть, сколько остаётся в месяц после всех расходов — и скольким месячным зарплатам в Баку это равно.',
        ],
      },
      {
        id: 'qenaet',
        h2: 'Как откладывать больше',
        blocks: [
          { ul: [
            'Комната в WG в первые месяцы намного дешевле отдельной квартиры.',
            'Вы в браке, а супруг зарабатывает мало или не работает? Налоговый класс III увеличивает нетто.',
            'На каждого ребёнка платят {{kindergeld}} детского пособия (Kindergeld) в месяц — заявление в Familienkasse.',
            'Дискаунтеры (Aldi, Lidl, Penny, Netto) и жизнь без машины с Deutschlandticket заметно снижают расходы.',
          ] },
        ],
      },
    ],
    faqTitle: 'Вопросы о жизни в Германии',
    faq: [
      { q: 'Сколько остаётся от обычной зарплаты в Германии?', a: 'Зависит от профессии, города и семьи. Одинокий водитель или медсестра в городе средней величины часто откладывают несколько сотен евро в месяц; в дорогом городе вроде Мюнхена или в семье с одним доходом может оставаться немного. Проверьте свой вариант в симуляторе.' },
      { q: 'Какой налоговый класс выбрать супругам?', a: 'Если работает один или один зарабатывает намного меньше — обычно III/V, при похожих доходах IV/IV. Годовая декларация выравнивает налог, но ежемесячное нетто зависит от класса.' },
      { q: 'Действует ли Deutschlandticket везде?', a: 'Во всём городском и региональном транспорте Германии (метро, автобус, трамвай, региональные поезда), но не в поездах дальнего следования (ICE, IC). Это ежемесячная подписка, которую можно отменить.' },
      { q: 'Насколько точны суммы в манатах?', a: 'Они рассчитаны по официальному курсу ЦБА с указанием даты. При переводе действуют курс и комиссия вашего банка, поэтому суммы в манатах приблизительны.' },
      { q: 'Откуда цифры аренды?', a: 'Из средних значений по городам (индексы аренды, объявления), которые наша команда проверяет и регулярно обновляет. Конкретная квартира может заметно отличаться в зависимости от района и состояния.' },
    ],
    sources: 'Актуально на: {{checked}}. Источники: официальная формула подоходного налога (Lohnsteuer PAP 2026), ставки соцстрахования 2026, Центральный банк Азербайджана (курс), Госкомстат Азербайджана (средняя зарплата), средние аренды и цены по городам. Ориентировочный расчёт, не налоговая и не юридическая консультация.',
  },
  tr: {
    eyebrow: 'Rakamlarla Almanya’da yaşam',
    sections: [
      {
        id: 'hesab',
        h2: 'Simülatör nasıl hesaplıyor?',
        blocks: [
          'Simülatör mesleğinizin tipik brüt maaşından başlar: yeterince açık ilanımız varsa onların maaş aralıklarından, yoksa Federal İş Ajansı’nın Entgeltatlas verilerine dayanan bir referans tablosundan. Ardından net maaşı resmî gelir vergisi formülü ve sosyal sigorta oranlarıyla — seçtiğiniz vergi sınıfına göre — hesaplar.',
          { ul: [
            '**Kira**: seçilen şehirde hane büyüklüğünüz için ortalama kira (tek: tek odalı daire veya WG odası, aile: iki odalı daire).',
            '**Faturalar**: elektrik ve yayın ücreti (Rundfunkbeitrag, daire başına ayda {{rundfunk}}); ısınma ve su sıcak kiraya dahildir.',
            '**Gıda**: şehrin ortalama fiyatları, çocuklar için daha az.',
            '**Ulaşım**: yetişkin başına bir Deutschlandticket — ayda {{ticket}}.',
            '**Telefon ve internet**, **sigortalar** (sorumluluk, kendi dairede ev eşyası) ve **kişisel giderler** (giyim, eğlence, çocuk giderleri).',
          ] },
          'Sonuç, ay sonunda kalan paradır. Tüm değerler aralık olarak verilir; grafik her aralığın ortasını gösterir.',
        ],
      },
      {
        id: 'manat',
        h2: 'Euro ve manat',
        blocks: [
          'Manat tutarları Azerbaycan Merkez Bankası’nın (CBAR) resmî euro kuruyla hesaplanır. Kur günde bir kez güncellenir ve tarihiyle gösterilir. Döviz bozdururken veya para gönderirken bankanızın kuru geçerlidir — manat değerleri karşılaştırma içindir.',
        ],
      },
      {
        id: 'baki',
        h2: 'Bakü ile karşılaştırma',
        blocks: [
          'Devlet İstatistik Komitesi’ne göre Azerbaycan’da {{avgYear}} yılında ortalama aylık nominal (brüt) ücret {{avgAzn}} oldu — bu tüm meslekler ve tüm ülke için bir ortalamadır, Bakü’de belirli bir mesleğin maaşı değildir. Ekibimiz bazı meslekler için kendi tahminini girebilir; her rakamın kaynağı yanında yazılır.',
          'Brüt maaşları doğrudan karşılaştırmak yanıltıcıdır: Almanya’da vergiler ve fiyatlar daha yüksektir. Daha doğru soru, tüm giderlerden sonra ayda ne kaldığı ve bunun Bakü’de kaç aylık maaşa denk geldiğidir.',
        ],
      },
      {
        id: 'qenaet',
        h2: 'Daha fazla nasıl biriktirilir?',
        blocks: [
          { ul: [
            'İlk aylarda bir WG odası kendi dairenizden çok daha ucuzdur.',
            'Evliyseniz ve eşiniz az kazanıyor ya da çalışmıyorsa, III. vergi sınıfı aylık neti artırır.',
            'Her çocuk için ayda {{kindergeld}} çocuk parası (Kindergeld) ödenir — başvuru Familienkasse’ye yapılır.',
            'İndirim marketleri (Aldi, Lidl, Penny, Netto) ve Deutschlandticket ile arabasız yaşam giderleri belirgin şekilde düşürür.',
          ] },
        ],
      },
    ],
    faqTitle: 'Almanya’da yaşam hakkında sorular',
    faq: [
      { q: 'Almanya’da normal bir maaştan ne kadar kalır?', a: 'Mesleğe, şehre ve haneye bağlıdır. Orta büyüklükte bir şehirde yaşayan bekâr bir tır şoförü veya hemşire çoğu zaman ayda birkaç yüz euro biriktirebilir; Münih gibi pahalı bir şehirde ya da tek gelirli bir ailede az para kalabilir. Kendi durumunuzu simülatörde deneyin.' },
      { q: 'Evliler hangi vergi sınıfını seçmeli?', a: 'Yalnızca biri çalışıyorsa veya biri çok daha az kazanıyorsa genelde III/V, gelirler benzerse IV/IV. Yıllık vergi beyannamesi yılı dengeler, ama aylık net sınıfa bağlıdır.' },
      { q: 'Deutschlandticket her yerde geçerli mi?', a: 'Almanya genelindeki tüm şehir içi ve bölgesel toplu taşımada (metro, otobüs, tramvay, bölgesel trenler) geçerlidir, uzun mesafe trenlerinde (ICE, IC) geçerli değildir. Her ay iptal edilebilen aylık bir aboneliktir.' },
      { q: 'Manat tutarları ne kadar kesin?', a: 'Tarihiyle gösterilen resmî CBAR kuruna dayanır. Para gönderirken bankanızın kuru ve ücretleri geçerli olduğundan manat değerleri yaklaşıktır.' },
      { q: 'Kira rakamları nereden geliyor?', a: 'Ekibimizin kontrol edip düzenli güncellediği şehir bazlı ortalamalardan (kira endeksleri, ilanlar). Belirli bir daire semte ve durumuna göre epey farklı olabilir.' },
    ],
    sources: 'Güncellik: {{checked}}. Kaynaklar: resmî gelir vergisi formülü (Lohnsteuer PAP 2026), 2026 sosyal sigorta değerleri, Azerbaycan Merkez Bankası (kur), Azerbaycan Devlet İstatistik Komitesi (ortalama ücret), şehir bazında ortalama kira ve fiyatlar. Bağlayıcı olmayan tahmin; vergi veya hukuki danışmanlık değildir.',
  },
  uk: {
    eyebrow: 'Життя в Німеччині в цифрах',
    sections: [
      {
        id: 'hesab',
        h2: 'Як рахує симулятор?',
        blocks: [
          'Симулятор починає з типової зарплати брутто вашої професії: за діапазонами зарплат наших відкритих вакансій, якщо їх достатньо, інакше — за довідковою таблицею на основі Entgeltatlas Федерального агентства з праці. Потім нетто розраховується за офіційною формулою податку на зарплату та ставками соцстрахування — для обраного податкового класу.',
          { ul: [
            '**Оренда**: середня оренда обраного міста для вашої родини (одна особа: однокімнатна квартира або кімната у WG, родина: двокімнатна квартира).',
            '**Комунальні**: електрика та радіомовний збір (Rundfunkbeitrag, {{rundfunk}} на місяць за квартиру); опалення й вода входять у теплу оренду.',
            '**Продукти**: середні ціни міста, для дітей менше.',
            '**Транспорт**: один Deutschlandticket на дорослого — {{ticket}} на місяць.',
            '**Телефон та інтернет**, **страховки** (відповідальність, майно у власній квартирі) і **особисті витрати** (одяг, дозвілля, витрати на дітей).',
          ] },
          'Результат — скільки залишається наприкінці місяця. Усі суми — діапазони; діаграма показує середину кожного.',
        ],
      },
      {
        id: 'manat',
        h2: 'Євро і манат',
        blocks: [
          'Суми в манатах перераховуються за офіційним курсом євро Центрального банку Азербайджану (ЦБА). Курс оновлюється раз на день і показується з датою. Під час обміну чи переказу діє курс вашого банку — суми в манатах слугують для порівняння.',
        ],
      },
      {
        id: 'baki',
        h2: 'Порівняння з Баку',
        blocks: [
          'За даними Державного комітету статистики, середня номінальна (брутто) зарплата в Азербайджані у {{avgYear}} році становила {{avgAzn}} на місяць — це середнє за всіма професіями та всією країною, а не зарплата конкретної професії в Баку. Наша команда може вказати власну оцінку для окремих професій; біля кожної цифри зазначено джерело.',
          'Пряме порівняння зарплат брутто вводить в оману: у Німеччині вищі податки й ціни. Правильніше дивитися, скільки залишається щомісяця після всіх витрат — і скільком місячним зарплатам у Баку це дорівнює.',
        ],
      },
      {
        id: 'qenaet',
        h2: 'Як заощаджувати більше',
        blocks: [
          { ul: [
            'Кімната у WG у перші місяці значно дешевша за окрему квартиру.',
            'Ви в шлюбі, а чоловік чи дружина заробляє мало або не працює? Податковий клас III збільшує нетто.',
            'На кожну дитину виплачують {{kindergeld}} дитячої допомоги (Kindergeld) на місяць — заява до Familienkasse.',
            'Дискаунтери (Aldi, Lidl, Penny, Netto) і життя без авто з Deutschlandticket помітно зменшують витрати.',
          ] },
        ],
      },
    ],
    faqTitle: 'Запитання про життя в Німеччині',
    faq: [
      { q: 'Скільки залишається від звичайної зарплати в Німеччині?', a: 'Залежить від професії, міста й родини. Самотній водій чи медсестра в місті середнього розміру часто відкладають кілька сотень євро на місяць; у дорогому місті на кшталт Мюнхена або в родині з одним доходом може залишатися небагато. Перевірте свій варіант у симуляторі.' },
      { q: 'Який податковий клас обрати подружжю?', a: 'Якщо працює один або один заробляє значно менше — зазвичай III/V, за схожих доходів IV/IV. Річна декларація вирівнює податок, але щомісячне нетто залежить від класу.' },
      { q: 'Чи діє Deutschlandticket усюди?', a: 'У всьому міському та регіональному транспорті Німеччини (метро, автобус, трамвай, регіональні поїзди), але не в поїздах далекого сполучення (ICE, IC). Це щомісячна підписка, яку можна скасувати.' },
      { q: 'Наскільки точні суми в манатах?', a: 'Вони розраховані за офіційним курсом ЦБА з датою. Під час переказу діють курс і комісія вашого банку, тому суми в манатах приблизні.' },
      { q: 'Звідки цифри оренди?', a: 'Із середніх значень по містах (індекси оренди, оголошення), які наша команда перевіряє й регулярно оновлює. Конкретна квартира може помітно відрізнятися залежно від району та стану.' },
    ],
    sources: 'Станом на: {{checked}}. Джерела: офіційна формула податку на зарплату (Lohnsteuer PAP 2026), ставки соцстрахування 2026, Центральний банк Азербайджану (курс), Держкомстат Азербайджану (середня зарплата), середні оренди й ціни по містах. Орієнтовний розрахунок, не податкова й не юридична консультація.',
  },
};

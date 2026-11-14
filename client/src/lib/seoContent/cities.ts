import type { LocalizedContent } from './types';

/**
 * Text under the city guide (/cities). Every money figure is a {{placeholder}} filled from the page's own city
 * data (lib/cities/data.ts, lib/cities/calc.ts) and the payroll engine (net of {{gross}}), so the article and the
 * city cards always agree. The "costs" slot is a table built from the same data. Legal facts: rent deposit at most
 * three net cold rents (§ 551 BGB); Deutschlandticket price from lib/cities/data.ts.
 */
export const citiesContent: LocalizedContent = {
  az: {
    eyebrow: 'İşçilər üçün Almaniya şəhərləri',
    sections: [
      {
        id: 'secim',
        h2: 'Almaniyanın hansı şəhərində işləmək və yaşamaq sərfəlidir?',
        blocks: [
          'Almaniyada iş axtaranda çoxları ilk növbədə Berlin, Münhen və ya Hamburqu düşünür. Lakin əlinizdə nə qədər pul qalacağını təkcə maaş yox, şəhər də müəyyən edir: ən böyük xərc kirayədir və o, şəhərdən şəhərə iki-üç dəfə fərqlənir. Məsələn, 35 m²-lik bir otaqlı mənzilin soyuq kirayəsi Münhendə {{munich1}}, Leypsiqdə isə {{leipzig1}} təşkil edir.',
          'Maaşlar da regiondan asılıdır — cənubda, qərbdə və böyük şəhərlərdə adətən şərqdən və kəndlərdən yüksəkdir. Amma bu fərq kirayə fərqi qədər böyük deyil. Ona görə orta ölçülü şəhərlərdə (Leypsiq, Drezden, Dortmund, Essen, Hannover, Bremen) eyni maaşla çox vaxt daha çox pul yığmaq olur.',
        ],
      },
      {
        id: 'xercler',
        h2: 'Maaşdan nə qalır? 15 yer müqayisədə',
        blocks: [
          'Aşağıdakı cədvəl tək yaşayan işçi üçündür: bir otaqlı mənzil (35 m²), kommunal xərclər, ərzaq, Deutschlandticket ({{ticket}}), telefon, sığorta və istirahət — avtomobilsiz. Son sütunda {{gross}} brutto maaşdan (məsələn, TIR sürücüsü, I vergi sinfi) xalis məbləğ çıxılandan sonra ayda təxminən nə qalacağı göstərilib.',
          { slot: 'costs' },
          'Bütün rəqəmlər təxminidir və rayona, mənzilin vəziyyətinə və şəxsi vərdişlərə görə xeyli fərqlənə bilər. Öz ailəniz üçün dəqiq hesablamanı aşağıdakı kalkulyatorda, maaşınızın xalis məbləğini isə [xalis maaş kalkulyatorunda](/salary-calculator) edə bilərsiniz.',
        ],
      },
      {
        id: 'isler',
        h2: 'Hansı şəhərdə hansı işlər var?',
        blocks: [
          { ul: [
            '**Logistika və sürücülər**: Hamburq və Bremen (limanlar), Leypsiq, Dortmund, Hannover və Nürnberq — böyük paylama mərkəzləri və nəqliyyat qovşaqları.',
            '**Avtomobil sənayesi və istehsal**: Münhen, Ştutqart, Leypsiq, Hannover və Bremen; Ştutqart və Nürnberq ətrafında elektrotexnika da güclüdür.',
            '**Tibb və qulluq**: tibb bacıları və qulluq işçiləri hər yerdə axtarılır — xüsusilə kiçik şəhərlərdə və kənd yerlərində, burada kirayə də ucuzdur.',
            '**İT və ofis işləri**: Berlin, Münhen, Frankfurt, Düsseldorf, Dortmund və Nürnberq.',
            '**Tikinti, elektrik və sənətkarlıq**: bütün böyük şəhərlərdə — Berlin, Münhen, Dortmund və Essen kimi şəhərlərdə xüsusilə çox iş var.',
          ] },
          'Hazırkı vakansiyaları şəhər və peşə üzrə [iş elanlarımızda](/jobs) görə bilərsiniz.',
        ],
      },
      {
        id: 'mesleh',
        h2: 'Şəhər seçərkən 5 məsləhət',
        blocks: [
          { ol: [
            '**Mənzili tez axtarmağa başlayın.** Berlin, Münhen, Hamburq və Frankfurtda mənzil bazarı çox gərgindir; ilk aylar üçün WG otağı və ya işəgötürənin təklif etdiyi yataqxana yaxşı başlanğıcdır.',
            '**Depozitə pul ayırın.** Kirayə depoziti ən çox üç aylıq soyuq kirayə ola bilər (§ 551 BGB) və adətən köçəndə ödənilir.',
            '**İş yeri ilə ev arasındakı yolu yoxlayın.** {{ticket}} qiymətli Deutschlandticket bütün ölkədə yerli nəqliyyatı əhatə edir — şəhərətrafı ucuz mənzil çox vaxt sərfəli olur.',
            '**Netto maaşı xərclərlə müqayisə edin.** Böyük şəhərdə yüksək maaş təklifi kiçik şəhərdəki aşağı təklifdən hər zaman daha sərfəli deyil.',
            '**İcmanı və dəstəyi nəzərə alın.** Böyük şəhərlərdə azərbaycanlı və türkdilli icmalar, rus dilində həkimlər və xidmətlər daha çoxdur — ilk ildə bu, uyğunlaşmanı asanlaşdırır.',
          ] },
        ],
      },
    ],
    faqTitle: 'Almaniya şəhərləri haqqında tez-tez verilən suallar',
    faq: [
      { q: 'Almaniyanın ən ucuz böyük şəhərləri hansılardır?', a: 'Məlumatlarımıza görə tək nəfər üçün ən aşağı xərclər Leypsiq, Drezden, Essen və Dortmunddadır — ayda təxminən {{leipzigSingle}}. Kiçik şəhərlərdə daha da ucuzdur.' },
      { q: 'Almaniyanın ən bahalı şəhəri hansıdır?', a: 'Münhen. Bir otaqlı mənzilin soyuq kirayəsi orada {{munich1}} təşkil edir, tək nəfərin aylıq xərcləri isə təxminən {{munichSingle}}.' },
      { q: 'Berlində tək yaşamaq ayda neçəyə başa gəlir?', a: 'Bir otaqlı mənzil, ərzaq, nəqliyyat və digər xərclərlə birlikdə təxminən {{berlinSingle}}. WG otağında yaşasanız, xeyli ucuz olur.' },
      { q: 'Almaniyada hansı şəhərdə iş tapmaq daha asandır?', a: 'Bu, peşədən asılıdır: sürücülər və logistika işçiləri üçün liman və logistika şəhərləri, tibb bacıları üçün demək olar ki, hər yer, İT mütəxəssisləri üçün isə Berlin, Münhen və Frankfurt. Konkret vakansiyalar iş elanlarımızdadır.' },
      { q: 'Deutschlandticket nə qədərdir?', a: '2026-cı ildə ayda {{ticket}}. Bilet bütün Almaniyada yerli və regional nəqliyyatda (avtobus, metro, tramvay, regional qatarlar) etibarlıdır.' },
      { q: 'Kirayə depoziti nə qədər olur?', a: 'Qanuna görə ən çox üç aylıq soyuq kirayə (§ 551 BGB). Onu üç bərabər hissədə ödəmək hüququnuz var.' },
    ],
    sources: 'Vəziyyət: {{checked}}. Kirayə və xərclər: açıq kirayə indeksləri və elan portalları əsasında təxmini dəyərlər ({{year}}); xalis maaş: saytın maaş kalkulyatoru (2026-cı il parametrləri).',
    labels: { city: 'Şəhər', state: 'Ştat', wg: 'WG otağı', flat: '1 otaqlı mənzil (soyuq)', single: 'Tək nəfər, aylıq', left: 'Qalan (xalis ≈ {{net}})', smallTown: 'Kiçik şəhər (nümunə)' },
  },

  de: {
    eyebrow: 'Deutsche Städte für Arbeitskräfte',
    sections: [
      {
        id: 'secim',
        h2: 'In welcher deutschen Stadt lohnt sich Arbeiten und Wohnen?',
        blocks: [
          'Wer in Deutschland Arbeit sucht, denkt oft zuerst an Berlin, München oder Hamburg. Wie viel am Monatsende übrig bleibt, hängt aber nicht nur vom Gehalt ab, sondern stark von der Stadt: Der größte Kostenblock ist die Miete, und sie unterscheidet sich zwischen den Städten um das Zwei- bis Dreifache. Ein 1-Zimmer-Apartment mit 35 m² kostet kalt in München {{munich1}}, in Leipzig {{leipzig1}}.',
          'Auch die Löhne schwanken regional – im Süden, im Westen und in Großstädten liegen sie meist über denen im Osten und auf dem Land. Der Unterschied ist aber kleiner als bei den Mieten. In mittelgroßen Städten wie Leipzig, Dresden, Dortmund, Essen, Hannover oder Bremen bleibt deshalb vom gleichen Gehalt oft mehr übrig.',
        ],
      },
      {
        id: 'xercler',
        h2: 'Was bleibt vom Lohn? 15 Orte im Vergleich',
        blocks: [
          'Die Tabelle gilt für eine alleinlebende Person: 1-Zimmer-Wohnung (35 m²), Nebenkosten, Lebensmittel, Deutschlandticket ({{ticket}}), Handy, Versicherungen und Freizeit – ohne Auto. Die letzte Spalte zeigt, was von {{gross}} brutto (z. B. Lkw-Fahrer, Steuerklasse I) nach Abzug der Lebenshaltungskosten ungefähr übrig bleibt.',
          { slot: 'costs' },
          'Alle Werte sind Richtwerte und können je nach Stadtteil, Zustand der Wohnung und Lebensstil deutlich abweichen. Für Ihren Haushalt rechnen Sie mit dem Kostenrechner weiter unten, Ihr Netto mit dem [Brutto-Netto-Rechner](/salary-calculator).',
        ],
      },
      {
        id: 'isler',
        h2: 'Welche Jobs gibt es wo?',
        blocks: [
          { ul: [
            '**Logistik und Berufskraftfahrer**: Hamburg und Bremen (Häfen), Leipzig, Dortmund, Hannover und Nürnberg – große Verteilzentren und Verkehrsknoten.',
            '**Automobil und Industrie**: München, Stuttgart, Leipzig, Hannover und Bremen; rund um Stuttgart und Nürnberg ist auch die Elektroindustrie stark.',
            '**Pflege und Gesundheit**: Pflegefachkräfte werden überall gesucht – besonders in kleineren Städten und auf dem Land, wo auch die Mieten niedrig sind.',
            '**IT und Büro**: Berlin, München, Frankfurt, Düsseldorf, Dortmund und Nürnberg.',
            '**Bau, Elektro und Handwerk**: in allen Großstädten, besonders viel in Berlin, München, Dortmund und Essen.',
          ] },
          'Aktuelle Stellen nach Stadt und Beruf finden Sie in unserer [Jobbörse](/jobs).',
        ],
      },
      {
        id: 'mesleh',
        h2: '5 Tipps für die Wahl der Stadt',
        blocks: [
          { ol: [
            '**Früh mit der Wohnungssuche beginnen.** In Berlin, München, Hamburg und Frankfurt ist der Wohnungsmarkt sehr angespannt; ein WG-Zimmer oder eine Unterkunft des Arbeitgebers ist für die ersten Monate ein guter Start.',
            '**Geld für die Kaution einplanen.** Die Mietkaution beträgt höchstens drei Nettokaltmieten (§ 551 BGB) und wird meist beim Einzug fällig.',
            '**Den Arbeitsweg prüfen.** Das Deutschlandticket für {{ticket}} gilt bundesweit im Nahverkehr – eine günstige Wohnung im Umland lohnt sich oft.',
            '**Netto mit Kosten vergleichen.** Ein höheres Angebot in der Großstadt ist nicht automatisch besser als ein niedrigeres in einer kleineren Stadt.',
            '**Community und Unterstützung bedenken.** In Großstädten gibt es mehr aserbaidschanische und türkischsprachige Gemeinden sowie russischsprachige Ärzte und Dienste – das erleichtert das erste Jahr.',
          ] },
        ],
      },
    ],
    faqTitle: 'Häufige Fragen zu deutschen Städten',
    faq: [
      { q: 'Welche deutschen Großstädte sind am günstigsten?', a: 'Nach unseren Daten sind die Kosten für eine alleinlebende Person in Leipzig, Dresden, Essen und Dortmund am niedrigsten – rund {{leipzigSingle}} im Monat. In Kleinstädten ist es noch günstiger.' },
      { q: 'Welche Stadt ist am teuersten?', a: 'München. Ein 1-Zimmer-Apartment kostet dort kalt {{munich1}}, die monatlichen Kosten einer alleinlebenden Person liegen bei etwa {{munichSingle}}.' },
      { q: 'Was kostet das Leben in Berlin für eine Person im Monat?', a: 'Mit 1-Zimmer-Wohnung, Lebensmitteln, Nahverkehr und sonstigen Ausgaben etwa {{berlinSingle}}. In einer WG wird es deutlich günstiger.' },
      { q: 'In welcher Stadt findet man am leichtesten Arbeit?', a: 'Das hängt vom Beruf ab: Für Fahrer und Logistik die Hafen- und Logistikstädte, für Pflegekräfte fast überall, für IT vor allem Berlin, München und Frankfurt. Konkrete Stellen finden Sie in unserer Jobbörse.' },
      { q: 'Wie viel kostet das Deutschlandticket?', a: '2026 kostet es {{ticket}} im Monat und gilt bundesweit im Nah- und Regionalverkehr (Bus, U-Bahn, Straßenbahn, Regionalzüge).' },
      { q: 'Wie hoch ist die Mietkaution?', a: 'Höchstens drei Nettokaltmieten (§ 551 BGB). Mieter dürfen sie in drei gleichen Monatsraten zahlen.' },
    ],
    sources: 'Stand: {{checked}}. Mieten und Kosten: Richtwerte auf Basis öffentlicher Mietspiegel und Inseratsportale ({{year}}); Netto: Gehaltsrechner dieser Website (Parameter 2026).',
    labels: { city: 'Stadt', state: 'Bundesland', wg: 'WG-Zimmer', flat: '1-Zimmer-Wohnung (kalt)', single: 'Single, pro Monat', left: 'Rest (netto ≈ {{net}})', smallTown: 'Kleinstadt (Beispiel)' },
  },

  en: {
    eyebrow: 'German cities for workers',
    sections: [
      {
        id: 'secim',
        h2: 'Which German city pays off for working and living?',
        blocks: [
          'Job seekers often think of Berlin, Munich or Hamburg first. How much is left at the end of the month, however, depends on the city as much as on the salary: rent is the biggest cost, and it differs between cities by a factor of two to three. A 35 m² one-room flat costs {{munich1}} cold rent in Munich and {{leipzig1}} in Leipzig.',
          'Wages vary by region too: in the south, the west and big cities they are usually higher than in the east and in rural areas. But the gap is smaller than the gap in rents, so in mid-sized cities such as Leipzig, Dresden, Dortmund, Essen, Hanover or Bremen the same salary often leaves you more.',
        ],
      },
      {
        id: 'xercler',
        h2: 'What is left of your pay? 15 places compared',
        blocks: [
          'The table is for a person living alone: one-room flat (35 m²), utilities, food, Deutschlandticket ({{ticket}}), phone, insurance and leisure, without a car. The last column shows roughly what is left of a {{gross}} gross salary (e.g. a truck driver, tax class I) after living costs.',
          { slot: 'costs' },
          'All values are estimates and can differ considerably by district, condition of the flat and lifestyle. For your own household use the cost calculator below, and the [net salary calculator](/salary-calculator) for your net pay.',
        ],
      },
      {
        id: 'isler',
        h2: 'Which jobs are where?',
        blocks: [
          { ul: [
            '**Logistics and professional drivers**: Hamburg and Bremen (ports), Leipzig, Dortmund, Hanover and Nuremberg, with large distribution centres and transport hubs.',
            '**Automotive and manufacturing**: Munich, Stuttgart, Leipzig, Hanover and Bremen; the electrical industry is strong around Stuttgart and Nuremberg.',
            '**Care and health**: nurses and care workers are needed everywhere, especially in smaller towns and rural areas, where rents are also low.',
            '**IT and office jobs**: Berlin, Munich, Frankfurt, Düsseldorf, Dortmund and Nuremberg.',
            '**Construction, electrical and trades**: in all big cities, with particularly many jobs in Berlin, Munich, Dortmund and Essen.',
          ] },
          'Current vacancies by city and occupation are in our [job board](/jobs).',
        ],
      },
      {
        id: 'mesleh',
        h2: '5 tips for choosing a city',
        blocks: [
          { ol: [
            '**Start looking for a flat early.** The housing markets in Berlin, Munich, Hamburg and Frankfurt are very tight; a room in a shared flat (WG) or employer housing is a good start for the first months.',
            '**Budget for the deposit.** A rent deposit is at most three months’ net cold rent (section 551 of the Civil Code) and is usually due when you move in.',
            '**Check the commute.** The Deutschlandticket for {{ticket}} covers local transport nationwide, so a cheaper flat outside the city often pays off.',
            '**Compare net pay with costs.** A higher offer in a big city is not automatically better than a lower one in a smaller town.',
            '**Think of community and support.** Big cities have more Azerbaijani and Turkish-speaking communities and Russian-speaking doctors and services, which makes the first year easier.',
          ] },
        ],
      },
    ],
    faqTitle: 'Frequently asked questions about German cities',
    faq: [
      { q: 'Which big German cities are the cheapest?', a: 'According to our data, costs for a single person are lowest in Leipzig, Dresden, Essen and Dortmund, about {{leipzigSingle}} a month. Small towns are cheaper still.' },
      { q: 'Which city is the most expensive?', a: 'Munich. A one-room flat costs {{munich1}} cold rent there, and a single person’s monthly costs are around {{munichSingle}}.' },
      { q: 'How much does it cost to live in Berlin per month?', a: 'With a one-room flat, food, local transport and other spending about {{berlinSingle}} for one person. A room in a shared flat is considerably cheaper.' },
      { q: 'In which city is it easiest to find work?', a: 'It depends on the occupation: port and logistics cities for drivers and logistics, almost anywhere for nurses, mainly Berlin, Munich and Frankfurt for IT. Specific vacancies are in our job board.' },
      { q: 'How much is the Deutschlandticket?', a: 'In 2026 it costs {{ticket}} a month and is valid nationwide on local and regional transport (bus, underground, tram, regional trains).' },
      { q: 'How high is the rent deposit?', a: 'At most three months’ net cold rent (section 551 of the Civil Code). Tenants may pay it in three equal monthly instalments.' },
    ],
    sources: 'As of {{checked}}. Rents and costs: estimates based on public rent indices and listing portals ({{year}}); net pay: this site’s salary calculator (2026 parameters).',
    labels: { city: 'City', state: 'State', wg: 'Room in a WG', flat: '1-room flat (cold)', single: 'Single, per month', left: 'Left (net ≈ {{net}})', smallTown: 'Small town (example)' },
  },

  ru: {
    eyebrow: 'Города Германии для работников',
    sections: [
      {
        id: 'secim',
        h2: 'В каком городе Германии выгодно работать и жить?',
        blocks: [
          'Ища работу в Германии, многие сначала думают о Берлине, Мюнхене или Гамбурге. Но сколько остаётся в конце месяца, зависит не только от зарплаты, но и от города: самая большая статья расходов — аренда, а она различается между городами в два-три раза. Однокомнатная квартира 35 м² стоит без коммунальных платежей в Мюнхене {{munich1}}, в Лейпциге — {{leipzig1}}.',
          'Зарплаты тоже зависят от региона: на юге, западе и в крупных городах они обычно выше, чем на востоке и в сельской местности. Но эта разница меньше, чем разница в аренде. Поэтому в средних городах — Лейпциге, Дрездене, Дортмунде, Эссене, Ганновере или Бремене — с той же зарплаты часто остаётся больше.',
        ],
      },
      {
        id: 'xercler',
        h2: 'Что остаётся от зарплаты? 15 мест в сравнении',
        blocks: [
          'Таблица рассчитана на одного человека: однокомнатная квартира (35 м²), коммунальные платежи, продукты, Deutschlandticket ({{ticket}}), телефон, страховки и досуг — без машины. В последнем столбце — сколько примерно остаётся от {{gross}} брутто (например, водитель грузовика, I налоговый класс) после расходов.',
          { slot: 'costs' },
          'Все значения ориентировочные и могут заметно отличаться в зависимости от района, состояния квартиры и образа жизни. Для своей семьи посчитайте в калькуляторе расходов ниже, а свою зарплату нетто — в [калькуляторе нетто](/salary-calculator).',
        ],
      },
      {
        id: 'isler',
        h2: 'Какая работа в каком городе?',
        blocks: [
          { ul: [
            '**Логистика и водители**: Гамбург и Бремен (порты), Лейпциг, Дортмунд, Ганновер и Нюрнберг — крупные распределительные центры и транспортные узлы.',
            '**Автопром и производство**: Мюнхен, Штутгарт, Лейпциг, Ганновер и Бремен; вокруг Штутгарта и Нюрнберга сильна и электротехническая промышленность.',
            '**Уход и медицина**: медсёстры и работники по уходу нужны везде — особенно в небольших городах и сельской местности, где и аренда ниже.',
            '**ИТ и офис**: Берлин, Мюнхен, Франкфурт, Дюссельдорф, Дортмунд и Нюрнберг.',
            '**Стройка, электрика и ремёсла**: во всех крупных городах, особенно много в Берлине, Мюнхене, Дортмунде и Эссене.',
          ] },
          'Актуальные вакансии по городам и профессиям — в нашем [разделе вакансий](/jobs).',
        ],
      },
      {
        id: 'mesleh',
        h2: '5 советов при выборе города',
        blocks: [
          { ol: [
            '**Начинайте искать жильё заранее.** В Берлине, Мюнхене, Гамбурге и Франкфурте рынок жилья очень напряжённый; комната в WG или жильё от работодателя — хороший старт на первые месяцы.',
            '**Заложите деньги на залог.** Залог за квартиру — не более трёх месячных арендных плат без коммунальных (§ 551 BGB), обычно его платят при въезде.',
            '**Проверьте дорогу до работы.** Deutschlandticket за {{ticket}} действует на местном транспорте по всей стране — дешёвая квартира в пригороде часто выгоднее.',
            '**Сравнивайте нетто с расходами.** Более высокое предложение в большом городе не всегда лучше более низкого в небольшом.',
            '**Учитывайте общину и поддержку.** В крупных городах больше азербайджанских и тюркоязычных общин, русскоязычных врачей и служб — это облегчает первый год.',
          ] },
        ],
      },
    ],
    faqTitle: 'Частые вопросы о городах Германии',
    faq: [
      { q: 'Какие крупные города Германии самые дешёвые?', a: 'По нашим данным, расходы одного человека ниже всего в Лейпциге, Дрездене, Эссене и Дортмунде — около {{leipzigSingle}} в месяц. В небольших городах ещё дешевле.' },
      { q: 'Какой город самый дорогой?', a: 'Мюнхен. Однокомнатная квартира стоит там без коммунальных {{munich1}}, а ежемесячные расходы одного человека — около {{munichSingle}}.' },
      { q: 'Сколько стоит жизнь в Берлине в месяц?', a: 'С однокомнатной квартирой, продуктами, транспортом и прочими расходами — около {{berlinSingle}} на одного человека. В WG заметно дешевле.' },
      { q: 'В каком городе легче всего найти работу?', a: 'Зависит от профессии: водителям и логистам — портовые и логистические города, медсёстрам — почти везде, ИТ-специалистам — прежде всего Берлин, Мюнхен и Франкфурт. Конкретные вакансии — в нашем разделе вакансий.' },
      { q: 'Сколько стоит Deutschlandticket?', a: 'В 2026 году — {{ticket}} в месяц; билет действует по всей Германии на местном и региональном транспорте (автобус, метро, трамвай, региональные поезда).' },
      { q: 'Какой залог за квартиру?', a: 'Не более трёх месячных арендных плат без коммунальных (§ 551 BGB). Арендатор вправе внести его тремя равными частями.' },
    ],
    sources: 'По состоянию на {{checked}}. Аренда и расходы: ориентировочные значения на основе открытых индексов аренды и порталов объявлений ({{year}}); нетто: калькулятор зарплаты этого сайта (параметры 2026).',
    labels: { city: 'Город', state: 'Земля', wg: 'Комната в WG', flat: '1-комн. квартира (без коммун.)', single: 'Один человек, в месяц', left: 'Остаток (нетто ≈ {{net}})', smallTown: 'Небольшой город (пример)' },
  },

  uk: {
    eyebrow: 'Міста Німеччини для працівників',
    sections: [
      {
        id: 'secim',
        h2: 'У якому місті Німеччини вигідно працювати й жити?',
        blocks: [
          'Шукаючи роботу в Німеччині, багато хто спершу думає про Берлін, Мюнхен чи Гамбург. Але скільки залишається наприкінці місяця, залежить не лише від зарплати, а й від міста: найбільша стаття витрат — оренда, і між містами вона різниться у два-три рази. Однокімнатна квартира 35 м² без комунальних коштує в Мюнхені {{munich1}}, у Лейпцигу — {{leipzig1}}.',
          'Зарплати теж залежать від регіону: на півдні, заході та у великих містах вони зазвичай вищі, ніж на сході та в сільській місцевості. Але ця різниця менша, ніж різниця в оренді. Тому в середніх містах — Лейпцигу, Дрездені, Дортмунді, Ессені, Ганновері чи Бремені — з тієї самої зарплати часто залишається більше.',
        ],
      },
      {
        id: 'xercler',
        h2: 'Що залишається від зарплати? 15 місць у порівнянні',
        blocks: [
          'Таблиця розрахована на одну особу: однокімнатна квартира (35 м²), комунальні платежі, продукти, Deutschlandticket ({{ticket}}), телефон, страховки та дозвілля — без авто. В останньому стовпці — скільки приблизно залишається від {{gross}} брутто (наприклад, водій вантажівки, I податковий клас) після витрат.',
          { slot: 'costs' },
          'Усі значення орієнтовні й можуть помітно відрізнятися залежно від району, стану квартири та способу життя. Для своєї родини порахуйте в калькуляторі витрат нижче, а свою зарплату нетто — у [калькуляторі нетто](/salary-calculator).',
        ],
      },
      {
        id: 'isler',
        h2: 'Яка робота в якому місті?',
        blocks: [
          { ul: [
            '**Логістика та водії**: Гамбург і Бремен (порти), Лейпциг, Дортмунд, Ганновер і Нюрнберг — великі розподільчі центри та транспортні вузли.',
            '**Автопром і виробництво**: Мюнхен, Штутгарт, Лейпциг, Ганновер і Бремен; довкола Штутгарта й Нюрнберга сильна й електротехнічна промисловість.',
            '**Догляд і медицина**: медсестри та доглядальники потрібні всюди — особливо в невеликих містах і сільській місцевості, де й оренда нижча.',
            '**ІТ та офіс**: Берлін, Мюнхен, Франкфурт, Дюссельдорф, Дортмунд і Нюрнберг.',
            '**Будівництво, електрика та ремесла**: в усіх великих містах, особливо багато в Берліні, Мюнхені, Дортмунді та Ессені.',
          ] },
          'Актуальні вакансії за містами та професіями — у нашому [розділі вакансій](/jobs).',
        ],
      },
      {
        id: 'mesleh',
        h2: '5 порад щодо вибору міста',
        blocks: [
          { ol: [
            '**Починайте шукати житло заздалегідь.** У Берліні, Мюнхені, Гамбурзі та Франкфурті ринок житла дуже напружений; кімната у WG чи житло від роботодавця — добрий старт на перші місяці.',
            '**Закладіть гроші на заставу.** Застава за квартиру — не більше трьох місячних орендних плат без комунальних (§ 551 BGB), зазвичай її сплачують при заселенні.',
            '**Перевірте дорогу до роботи.** Deutschlandticket за {{ticket}} діє в місцевому транспорті по всій країні — дешевша квартира в передмісті часто вигідніша.',
            '**Порівнюйте нетто з витратами.** Вища пропозиція у великому місті не завжди краща за нижчу в невеликому.',
            '**Зважайте на громаду й підтримку.** У великих містах більше україномовних і російськомовних лікарів і служб, а також різних громад — це полегшує перший рік.',
          ] },
        ],
      },
    ],
    faqTitle: 'Часті запитання про міста Німеччини',
    faq: [
      { q: 'Які великі міста Німеччини найдешевші?', a: 'За нашими даними, витрати однієї особи найнижчі в Лейпцигу, Дрездені, Ессені та Дортмунді — близько {{leipzigSingle}} на місяць. У невеликих містах ще дешевше.' },
      { q: 'Яке місто найдорожче?', a: 'Мюнхен. Однокімнатна квартира коштує там без комунальних {{munich1}}, а щомісячні витрати однієї особи — близько {{munichSingle}}.' },
      { q: 'Скільки коштує життя в Берліні на місяць?', a: 'З однокімнатною квартирою, продуктами, транспортом та іншими витратами — близько {{berlinSingle}} на одну особу. У WG помітно дешевше.' },
      { q: 'У якому місті найлегше знайти роботу?', a: 'Залежить від професії: водіям і логістам — портові та логістичні міста, медсестрам — майже всюди, ІТ-фахівцям — насамперед Берлін, Мюнхен і Франкфурт. Конкретні вакансії — у нашому розділі вакансій.' },
      { q: 'Скільки коштує Deutschlandticket?', a: 'У 2026 році — {{ticket}} на місяць; квиток діє по всій Німеччині в місцевому та регіональному транспорті (автобус, метро, трамвай, регіональні потяги).' },
      { q: 'Яка застава за квартиру?', a: 'Не більше трьох місячних орендних плат без комунальних (§ 551 BGB). Орендар має право сплатити її трьома рівними частинами.' },
    ],
    sources: 'Станом на {{checked}}. Оренда й витрати: орієнтовні значення на основі відкритих індексів оренди та порталів оголошень ({{year}}); нетто: калькулятор зарплати цього сайту (параметри 2026).',
    labels: { city: 'Місто', state: 'Земля', wg: 'Кімната у WG', flat: '1-кімн. квартира (без комун.)', single: 'Одна особа, на місяць', left: 'Залишок (нетто ≈ {{net}})', smallTown: 'Невелике місто (приклад)' },
  },

  tr: {
    eyebrow: 'Çalışanlar için Alman şehirleri',
    sections: [
      {
        id: 'secim',
        h2: 'Almanya’nın hangi şehrinde çalışmak ve yaşamak daha kârlı?',
        blocks: [
          'Almanya’da iş arayanlar çoğu zaman önce Berlin, Münih veya Hamburg’u düşünür. Ancak ay sonunda ne kadar kalacağı yalnızca maaşa değil, şehre de bağlıdır: en büyük gider kiradır ve şehirler arasında iki-üç kat fark eder. 35 m²’lik tek odalı bir dairenin aidatsız kirası Münih’te {{munich1}}, Leipzig’de ise {{leipzig1}}.',
          'Maaşlar da bölgeye göre değişir: güneyde, batıda ve büyük şehirlerde genellikle doğudan ve kırsaldan yüksektir. Ancak bu fark kira farkından küçüktür. Bu yüzden Leipzig, Dresden, Dortmund, Essen, Hannover veya Bremen gibi orta büyüklükteki şehirlerde aynı maaştan çoğu zaman daha fazla para kalır.',
        ],
      },
      {
        id: 'xercler',
        h2: 'Maaştan ne kalır? 15 yer karşılaştırmalı',
        blocks: [
          'Tablo tek yaşayan biri içindir: tek odalı daire (35 m²), yan giderler, gıda, Deutschlandticket ({{ticket}}), telefon, sigortalar ve boş zaman — arabasız. Son sütun, {{gross}} brüt maaştan (örneğin tır şoförü, I. vergi sınıfı) yaşam giderleri düşüldükten sonra yaklaşık ne kaldığını gösterir.',
          { slot: 'costs' },
          'Tüm değerler tahminidir; semte, dairenin durumuna ve yaşam tarzına göre belirgin şekilde değişebilir. Kendi haneniz için aşağıdaki gider hesaplayıcısını, netiniz için [net maaş hesaplayıcısını](/salary-calculator) kullanın.',
        ],
      },
      {
        id: 'isler',
        h2: 'Hangi şehirde hangi işler var?',
        blocks: [
          { ul: [
            '**Lojistik ve şoförler**: Hamburg ve Bremen (limanlar), Leipzig, Dortmund, Hannover ve Nürnberg — büyük dağıtım merkezleri ve ulaşım düğüm noktaları.',
            '**Otomotiv ve sanayi**: Münih, Stuttgart, Leipzig, Hannover ve Bremen; Stuttgart ve Nürnberg çevresinde elektrik sanayisi de güçlüdür.',
            '**Bakım ve sağlık**: hemşireler ve bakım elemanları her yerde aranır — özellikle kiraların da düşük olduğu küçük şehirlerde ve kırsalda.',
            '**BT ve ofis işleri**: Berlin, Münih, Frankfurt, Düsseldorf, Dortmund ve Nürnberg.',
            '**İnşaat, elektrik ve zanaat**: tüm büyük şehirlerde; özellikle Berlin, Münih, Dortmund ve Essen’de çok iş vardır.',
          ] },
          'Şehir ve mesleğe göre güncel ilanlar [iş ilanlarımızda](/jobs).',
        ],
      },
      {
        id: 'mesleh',
        h2: 'Şehir seçerken 5 ipucu',
        blocks: [
          { ol: [
            '**Ev aramaya erken başlayın.** Berlin, Münih, Hamburg ve Frankfurt’ta konut piyasası çok sıkışıktır; ilk aylar için WG odası veya işverenin konutu iyi bir başlangıçtır.',
            '**Depozito için para ayırın.** Kira depozitosu en fazla üç aylık aidatsız kiradır (§ 551 BGB) ve genellikle taşınırken ödenir.',
            '**İşe ulaşımı kontrol edin.** {{ticket}} fiyatlı Deutschlandticket tüm ülkede yerel ulaşımda geçerlidir; şehir dışındaki uygun bir daire çoğu zaman daha kârlıdır.',
            '**Neti giderlerle karşılaştırın.** Büyük şehirdeki yüksek teklif, küçük şehirdeki düşük tekliften otomatik olarak daha iyi değildir.',
            '**Topluluğu ve desteği düşünün.** Büyük şehirlerde Türk ve Azerbaycanlı topluluklar, Türkçe konuşan doktorlar ve hizmetler daha fazladır; bu ilk yılı kolaylaştırır.',
          ] },
        ],
      },
    ],
    faqTitle: 'Alman şehirleri hakkında sık sorulan sorular',
    faq: [
      { q: 'Almanya’nın en ucuz büyük şehirleri hangileri?', a: 'Verilerimize göre tek kişilik giderler Leipzig, Dresden, Essen ve Dortmund’da en düşüktür — ayda yaklaşık {{leipzigSingle}}. Küçük şehirlerde daha da ucuzdur.' },
      { q: 'En pahalı şehir hangisi?', a: 'Münih. Tek odalı bir dairenin aidatsız kirası orada {{munich1}}, tek kişinin aylık giderleri ise yaklaşık {{munichSingle}}.' },
      { q: 'Berlin’de yaşamak aylık ne kadar?', a: 'Tek odalı daire, gıda, ulaşım ve diğer harcamalarla bir kişi için yaklaşık {{berlinSingle}}. WG’de belirgin şekilde daha ucuzdur.' },
      { q: 'Hangi şehirde iş bulmak daha kolay?', a: 'Mesleğe bağlıdır: şoförler ve lojistik için liman ve lojistik şehirleri, hemşireler için neredeyse her yer, BT için özellikle Berlin, Münih ve Frankfurt. Somut ilanlar iş ilanlarımızda.' },
      { q: 'Deutschlandticket ne kadar?', a: '2026’da aylık {{ticket}}; tüm Almanya’da yerel ve bölgesel ulaşımda (otobüs, metro, tramvay, bölgesel trenler) geçerlidir.' },
      { q: 'Kira depozitosu ne kadar?', a: 'En fazla üç aylık aidatsız kira (§ 551 BGB). Kiracı bunu üç eşit taksitte ödeyebilir.' },
    ],
    sources: 'Güncelleme: {{checked}}. Kira ve giderler: kamuya açık kira endeksleri ve ilan portallarına dayalı tahmini değerler ({{year}}); net: bu sitenin maaş hesaplayıcısı (2026 parametreleri).',
    labels: { city: 'Şehir', state: 'Eyalet', wg: 'WG odası', flat: 'Tek odalı daire (aidatsız)', single: 'Tek kişi, aylık', left: 'Kalan (net ≈ {{net}})', smallTown: 'Küçük şehir (örnek)' },
  },
};

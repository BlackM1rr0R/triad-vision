import type { Locale } from '@/i18n';

/**
 * Day trips with the Deutschlandticket (/weekend-trips): for every city of the city guide (lib/cities) ten
 * destinations that can be reached with regional transport only (RE, RB, S-Bahn, plus local buses / trams for the
 * last kilometres) — the Deutschlandticket is not valid in ICE, IC and EC trains.
 *
 * Travel times are approximate ranges for one way in minutes, checked against the regional timetables as of
 * November 2026 (typical fastest regional connection → typical connection with one extra change). They change
 * with every timetable and with construction work, so the page always says "approx., check bahn.de".
 * `station` is the stop name used for the bahn.de search link; `osm` the place searched on openstreetmap.org.
 */

export type L4 = Record<Locale, string>;
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TripKind = 'city' | 'castle' | 'nature' | 'lake' | 'sea' | 'mountains' | 'industrial' | 'wine';

export interface Trip {
  id: string;
  name: string;
  station: string;
  osm: string;
  minutes: readonly [number, number];
  lines: string;
  kind: TripKind;
  seasons: readonly Season[];
  why: L4;
  /** Optional caveat (a part of the trip that is not covered by the ticket etc.). */
  note?: L4;
}

export interface TripOrigin {
  /** Slug of the city in lib/cities/data.ts. */
  city: string;
  station: string;
  trips: Trip[];
}

const ALL: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
const WARM: readonly Season[] = ['spring', 'summer', 'autumn'];
const SUMMER: readonly Season[] = ['summer'];
const SPRING_SUMMER: readonly Season[] = ['spring', 'summer'];

/** Reused destinations (the same place reached from several cities; only time and lines differ). */
const W = {
  potsdam: { az: 'Sanssouci sarayları və parkları — UNESCO irsi, şəhərin yanında.', de: 'Schlösser und Parks von Sanssouci – UNESCO-Welterbe direkt vor Berlin.', en: 'The palaces and parks of Sanssouci — UNESCO World Heritage right next to Berlin.', ru: 'Дворцы и парки Сан-Суси — наследие ЮНЕСКО рядом с Берлином.' },
  wittenberg: { az: 'Lüterin şəhəri: Reformasiyanın başladığı yerlər, UNESCO irsi.', de: 'Lutherstadt: Orte der Reformation, UNESCO-Welterbe und eine kleine Altstadt.', en: 'Luther’s town: where the Reformation began, UNESCO-listed sites and a small old town.', ru: 'Город Лютера: места Реформации, наследие ЮНЕСКО и уютный старый город.' },
  luebeck: { az: 'Holstentor, kərpic qotikası və məşhur marsipan — UNESCO köhnə şəhəri.', de: 'Holstentor, Backsteingotik und Marzipan – eine Altstadt als UNESCO-Welterbe.', en: 'Holstentor gate, brick Gothic and marzipan — an old town on the UNESCO list.', ru: 'Ворота Хольстентор, кирпичная готика и марципан — старый город ЮНЕСКО.' },
  lueneburg: { az: 'Duz ticarəti ilə varlanmış şəhər: əyri evlər, meydanlar; avqustda yaxınlıqda çiçəklənən Heide.', de: 'Salzstadt mit schiefen Giebelhäusern; im August blüht in der Nähe die Lüneburger Heide.', en: 'Old salt town with leaning gabled houses; in August the Lüneburg Heath blooms nearby.', ru: 'Старый соляной город с покосившимися домами; в августе рядом цветёт Люнебургская пустошь.' },
  bremen: { az: 'Roland heykəli, Bremen musiqiçiləri və dar Schnoor məhəlləsi.', de: 'Roland, Stadtmusikanten und das enge Schnoorviertel an der Weser.', en: 'The Roland statue, the Town Musicians and the narrow Schnoor quarter on the Weser.', ru: 'Статуя Роланда, Бременские музыканты и узкий квартал Шнор на Везере.' },
  cuxhaven: { az: 'Şimal dənizi: Wattenmeer-də piyada gəzinti (yalnız bələdçi ilə) və gəmilərə baxış.', de: 'Nordsee: Wattwanderung (nur mit Führung) und Schiffe gucken an der Kugelbake.', en: 'North Sea: mudflat walks (only with a guide) and watching ships at the Kugelbake.', ru: 'Северное море: прогулка по ваттам (только с гидом) и корабли у маяка Кугельбаке.' },
  augsburg: { az: 'Dünyanın ən qədim sosial yaşayış kompleksi Fuggerei və UNESCO su sistemi.', de: 'Die Fuggerei – älteste Sozialsiedlung der Welt – und das UNESCO-Wassersystem.', en: 'The Fuggerei, the world’s oldest social housing, and the UNESCO water system.', ru: 'Фуггерай — старейший социальный квартал мира — и водная система ЮНЕСКО.' },
  regensburg: { az: 'Orta əsrlərdən qalmış daş körpü və UNESCO köhnə şəhəri, Dunay sahili.', de: 'Steinerne Brücke, mittelalterliche Altstadt (UNESCO) und Würstchen an der Donau.', en: 'The Stone Bridge, a medieval UNESCO old town and sausages on the Danube.', ru: 'Каменный мост, средневековый старый город ЮНЕСКО и колбаски на Дунае.' },
  bonn: { az: 'Bethovenin evi, Reyn sahilində gəzinti və keçmiş paytaxt məhəlləsi.', de: 'Beethoven-Haus, Rheinpromenade und das ehemalige Regierungsviertel.', en: 'Beethoven’s birthplace, the Rhine promenade and the former government quarter.', ru: 'Дом Бетховена, набережная Рейна и бывший правительственный квартал.' },
  aachen: { az: 'Böyük Karlın kafedralı (UNESCO), isti bulaqlar və Printen peçenyesi.', de: 'Kaiserdom Karls des Großen (UNESCO), Thermalquellen und Aachener Printen.', en: 'Charlemagne’s cathedral (UNESCO), hot springs and Aachener Printen gingerbread.', ru: 'Собор Карла Великого (ЮНЕСКО), термальные источники и пряники Printen.' },
  duesseldorf: { az: 'Köhnə şəhər, Reyn sahili, Königsallee və Medienhafen memarlığı.', de: 'Altstadt, Rheinuferpromenade, Königsallee und die Architektur im Medienhafen.', en: 'The old town, Rhine promenade, Königsallee and the architecture of the Media Harbour.', ru: 'Старый город, набережная Рейна, Кёнигсаллее и архитектура Медиахафена.' },
  koeln: { az: 'Köln kafedralı (UNESCO), Reyn sahili və muzeylər.', de: 'Kölner Dom (UNESCO), Rheinufer, Museen und Kölsch in der Altstadt.', en: 'Cologne Cathedral (UNESCO), the Rhine bank, museums and Kölsch in the old town.', ru: 'Кёльнский собор (ЮНЕСКО), берег Рейна, музеи и кёльш в старом городе.' },
  wuppertal: { az: 'Dünyada tək olan asma qatar Schwebebahn — bilet daxildir.', de: 'Die einzigartige Schwebebahn – mit dem Deutschlandticket inklusive.', en: 'The one-of-a-kind suspension railway (Schwebebahn) — included in the ticket.', ru: 'Уникальная подвесная дорога Швебебан — входит в билет.' },
  heidelberg: { az: 'Qala xarabalığı, Köhnə körpü və Almaniyanın ən qədim universiteti.', de: 'Schlossruine, Alte Brücke und Deutschlands älteste Universität am Neckar.', en: 'The castle ruins, the Old Bridge and Germany’s oldest university on the Neckar.', ru: 'Руины замка, Старый мост и старейший университет Германии на Неккаре.' },
  wuerzburg: { az: 'Residenz sarayı (UNESCO), Main körpüsündə şərab və Marienberg qalası.', de: 'Residenz (UNESCO), ein Schoppen Frankenwein auf der Alten Mainbrücke, Festung Marienberg.', en: 'The Residenz palace (UNESCO), Franconian wine on the Old Main Bridge, Marienberg fortress.', ru: 'Резиденция (ЮНЕСКО), франконское вино на Старом мосту, крепость Мариенберг.' },
  muenster: { az: 'Velosipedlər şəhəri: Prinzipalmarkt, kafedral və Aasee gölü.', de: 'Fahrradstadt mit Prinzipalmarkt, Dom und Spaziergang am Aasee.', en: 'Bicycle city: the Prinzipalmarkt arcades, the cathedral and a walk around the Aasee.', ru: 'Город велосипедов: Принципальмаркт, собор и прогулка вокруг озера Азе.' },
  zollverein: { az: 'Keçmiş kömür mədəni Zollverein — UNESCO irsi, Ruhr muzeyi.', de: 'Zeche Zollverein: Industriedenkmal (UNESCO) mit Ruhr Museum und Werksschwimmbad im Sommer.', en: 'Zollverein colliery: industrial UNESCO site with the Ruhr Museum.', ru: 'Шахта Цольферайн: индустриальное наследие ЮНЕСКО и Рурский музей.' },
  landschaftspark: { az: 'Köhnə metallurgiya zavodu park kimi: dırmanma, dalğıc və gecə işıqlandırması.', de: 'Stillgelegtes Hüttenwerk als Park: Klettern, Tauchen im Gasometer, abends Lichtinstallation.', en: 'A closed steelworks turned park: climbing, diving in a gasometer, light show after dark.', ru: 'Бывший металлургический завод — парк: скалолазание, дайвинг, подсветка ночью.' },
  haltern: { az: 'Halterner Stausee-də qumlu çimərlik və meşədə velosiped yolları.', de: 'Sandstrand am Halterner Stausee und Radwege durch die Hohe Mark.', en: 'A sandy beach on the Haltern reservoir and cycle paths through the forest.', ru: 'Песчаный пляж на водохранилище Хальтерн и велодорожки через лес.' },
  hattingen: { az: 'Taxta karkaslı evlər, Ruhr çayı boyunca velosiped yolu.', de: 'Fachwerk-Altstadt und der Ruhrtalradweg direkt am Fluss.', en: 'A half-timbered old town and the Ruhr Valley cycle route along the river.', ru: 'Фахверковый старый город и велодорожка вдоль Рура.' },
  xanten: { az: 'Roma şəhərinin yenidən qurulmuş arxeoloji parkı.', de: 'Archäologischer Park mit rekonstruierter Römerstadt und Amphitheater.', en: 'Archaeological park with a reconstructed Roman town and amphitheatre.', ru: 'Археологический парк с реконструированным римским городом и амфитеатром.' },
  dresden: { az: 'Frauenkirche, Zwinger və Elba sahili — barokko şəhəri.', de: 'Frauenkirche, Zwinger und Elbufer – Barock und Kunstsammlungen.', en: 'The Frauenkirche, the Zwinger and the Elbe bank — baroque and art collections.', ru: 'Фрауэнкирхе, Цвингер и берег Эльбы — барокко и художественные собрания.' },
  leipzig: { az: 'Bax, Nikolaikirche, passajlar və Völkerschlachtdenkmal.', de: 'Bach, Nikolaikirche, Passagen und das Völkerschlachtdenkmal.', en: 'Bach, St Nicholas Church, the shopping arcades and the Monument to the Battle of the Nations.', ru: 'Бах, церковь Святого Николая, пассажи и Памятник Битве народов.' },
  meissen: { az: 'Meissen çini fabriki, təpədə qala və kafedral.', de: 'Porzellan-Manufaktur, Albrechtsburg und Dom hoch über der Elbe.', en: 'The porcelain manufactory, Albrechtsburg castle and the cathedral above the Elbe.', ru: 'Фарфоровая мануфактура, замок Альбрехтсбург и собор над Эльбой.' },
  hamburg: { az: 'Liman, Speicherstadt (UNESCO), Elbphilharmonie meydançası (pulsuz).', de: 'Hafen, Speicherstadt (UNESCO) und die kostenlose Plaza der Elbphilharmonie.', en: 'The port, the Speicherstadt (UNESCO) and the free Elbphilharmonie Plaza.', ru: 'Порт, Шпайхерштадт (ЮНЕСКО) и бесплатная площадка Эльбской филармонии.' },
  osnabrueck: { az: 'Vestfaliya sülhünün şəhəri: tarixi bələdiyyə binası və köhnə şəhər.', de: 'Friedensstadt: historisches Rathaus des Westfälischen Friedens und Altstadt.', en: 'City of the Peace of Westphalia: historic town hall and old town.', ru: 'Город Вестфальского мира: историческая ратуша и старый город.' },
} satisfies Record<string, L4>;

const t = (
  id: string,
  name: string,
  station: string,
  minutes: readonly [number, number],
  lines: string,
  kind: TripKind,
  seasons: readonly Season[],
  why: L4,
  extra: { osm?: string; note?: L4 } = {},
): Trip => ({ id, name, station, osm: extra.osm ?? name, minutes, lines, kind, seasons, why, ...(extra.note ? { note: extra.note } : {}) });

const BOAT: L4 = {
  az: 'Göl/çay gəmiləri adətən biletə daxil deyil.',
  de: 'Ausflugsschiffe sind meist nicht im Deutschlandticket enthalten.',
  en: 'Excursion boats are usually not included in the ticket.',
  ru: 'Экскурсионные теплоходы обычно не входят в билет.',
};
const MOUNTAIN_RAIL: L4 = {
  az: 'Kanat yolları və dişli dağ qatarları biletə daxil deyil.',
  de: 'Seilbahnen und Zahnradbahnen sind nicht enthalten.',
  en: 'Cable cars and rack railways are not included.',
  ru: 'Канатные и зубчатые дороги не входят в билет.',
};

export const TRIP_ORIGINS: TripOrigin[] = [
  {
    city: 'berlin',
    station: 'Berlin Hbf',
    trips: [
      t('potsdam', 'Potsdam', 'Potsdam Hbf', [25, 40], 'RE1 · S7', 'castle', ALL, W.potsdam),
      t('spreewald', 'Lübbenau (Spreewald)', 'Lübbenau(Spreewald)', [60, 80], 'RE2', 'nature', WARM, { az: 'Spreewald kanallarında qayıqla gəzinti və məşhur duzlu xiyar.', de: 'Kahnfahrt durch die Fließe des Spreewalds und die berühmten Gurken.', en: 'Punting through the Spreewald canals and the famous pickled gherkins.', ru: 'Катание на лодке по каналам Шпревальда и знаменитые огурцы.' }, { note: BOAT }),
      t('werder', 'Werder (Havel)', 'Werder(Havel)', [35, 45], 'RE1', 'lake', SPRING_SUMMER, { az: 'Havel çayında ada-şəhər; aprel-mayda meyvə ağaclarının çiçəklənməsi.', de: 'Inselstadt in der Havel; im Frühjahr Obstblüte und Baumblütenfest.', en: 'An island town in the Havel; fruit-tree blossom and the blossom festival in spring.', ru: 'Город на острове в Хафеле; весной цветут сады и проходит праздник цветения.' }),
      t('brandenburg', 'Brandenburg an der Havel', 'Brandenburg Hbf', [45, 60], 'RE1', 'city', ALL, { az: 'Su ilə əhatə olunmuş köhnə şəhər, kafedral və gəzinti yolları.', de: 'Altstadt zwischen Havelarmen, Dom und Wasserwege.', en: 'An old town between arms of the Havel, a cathedral and waterways.', ru: 'Старый город между рукавами Хафеля, собор и водные пути.' }),
      t('chorin', 'Kloster Chorin', 'Chorin', [50, 70], 'RB24 · RE3', 'castle', WARM, { az: 'Meşədə kərpic qotik monastır xarabalığı; yayda konsertlər.', de: 'Backsteingotische Klosterruine im Wald, im Sommer Konzerte.', en: 'A brick Gothic abbey ruin in the forest, with summer concerts.', ru: 'Руины кирпичного готического монастыря в лесу, летом концерты.' }, { osm: 'Kloster Chorin' }),
      t('bad-saarow', 'Bad Saarow (Scharmützelsee)', 'Bad Saarow', [70, 100], 'RE1 + RB35', 'lake', ALL, { az: 'Scharmützelsee gölü və termal hamam — qışda da yaxşıdır.', de: 'Scharmützelsee und die Therme – auch im Winter ein Ausflug.', en: 'The Scharmützelsee lake and a thermal spa — a trip for winter too.', ru: 'Озеро Шармютцельзее и термы — подходит и зимой.' }),
      t('wittenberg', 'Lutherstadt Wittenberg', 'Lutherstadt Wittenberg Hbf', [75, 100], 'RE3', 'city', ALL, W.wittenberg),
      t('neuruppin', 'Neuruppin', 'Neuruppin Rheinsberger Tor', [60, 80], 'RE6', 'lake', WARM, { az: 'Yazıçı Fontanenin şəhəri, uzun Ruppiner See gölü sahilində.', de: 'Fontanestadt am langen Ruppiner See mit Uferpromenade.', en: 'Fontane’s home town on the long Ruppiner See with a lakeside promenade.', ru: 'Город Фонтане на длинном озере Руппинер-Зе с набережной.' }),
      t('frankfurt-oder', 'Frankfurt (Oder)', 'Frankfurt(Oder)', [60, 75], 'RE1', 'city', ALL, { az: 'Oder çayı üzərindən piyada Polşaya — Słubice şəhərinə.', de: 'Zu Fuß über die Oderbrücke nach Słubice in Polen.', en: 'Walk across the Oder bridge to Słubice in Poland.', ru: 'Пешком через мост на Одере в польские Слубице.' }),
      t('stralsund', 'Stralsund', 'Stralsund Hbf', [180, 210], 'RE3', 'sea', SUMMER, { az: 'Baltik dənizi sahilində Hanza şəhəri (UNESCO) və Ozeaneum — uzun, amma dəyər.', de: 'Hansestadt an der Ostsee (UNESCO) mit Ozeaneum – lang, aber lohnend.', en: 'A Hanseatic UNESCO town on the Baltic with the Ozeaneum — a long but rewarding day.', ru: 'Ганзейский город ЮНЕСКО на Балтике с Озеанеумом — долго, но того стоит.' }),
    ],
  },
  {
    city: 'hamburg',
    station: 'Hamburg Hbf',
    trips: [
      t('luebeck', 'Lübeck', 'Lübeck Hbf', [40, 50], 'RE8 · RE80', 'city', ALL, W.luebeck),
      t('travemuende', 'Travemünde', 'Lübeck-Travemünde Strand', [60, 85], 'RE8 + RB86', 'sea', SUMMER, { az: 'Baltik dənizində qumlu çimərlik və böyük bərələrə baxış.', de: 'Ostseestrand, Strandkörbe und große Fähren nach Skandinavien.', en: 'A Baltic beach with wicker beach chairs and big ferries to Scandinavia.', ru: 'Пляж на Балтике, плетёные кресла и большие паромы в Скандинавию.' }),
      t('lueneburg', 'Lüneburg', 'Lüneburg', [30, 45], 'RE3 · RB31', 'city', ALL, W.lueneburg),
      t('stade', 'Stade & Altes Land', 'Stade', [55, 70], 'S5', 'nature', ['spring', 'autumn'], { az: 'Avropanın ən böyük meyvə bağları: aprel-mayda çiçəklər, payızda alma.', de: 'Größtes Obstanbaugebiet Nordeuropas: Blüte im April/Mai, Äpfel im Herbst.', en: 'Northern Europe’s largest orchard region: blossom in April–May, apples in autumn.', ru: 'Крупнейший фруктовый регион Северной Европы: цветение в апреле–мае, яблоки осенью.' }, { osm: 'Stade' }),
      t('cuxhaven', 'Cuxhaven', 'Cuxhaven', [110, 130], 'RE5', 'sea', SUMMER, W.cuxhaven),
      t('schwerin', 'Schwerin', 'Schwerin Hbf', [60, 90], 'RE1', 'castle', ALL, { az: 'Göldəki adada nağılvari qala və bağlar.', de: 'Märchenschloss auf einer Insel im Schweriner See mit Schlossgarten.', en: 'A fairy-tale castle on an island in the lake, with palace gardens.', ru: 'Сказочный замок на острове в озере и дворцовый сад.' }),
      t('kiel', 'Kiel', 'Kiel Hbf', [70, 90], 'RE7 · RE70', 'sea', SUMMER, { az: 'Kil körfəzi, yelkənli qayıqlar və Laboe-yə yerli bərə.', de: 'Kieler Förde, Segelboote und mit der Fördefähre nach Laboe.', en: 'The Kiel Fjord, sailing boats and the local fjord ferry to Laboe.', ru: 'Кильский фьорд, парусники и местный паром до Лабё.' }),
      t('bremen', 'Bremen', 'Bremen Hbf', [70, 90], 'RE4 · RB41', 'city', ALL, W.bremen),
      t('sylt', 'Sylt (Westerland)', 'Westerland(Sylt)', [170, 200], 'RE6', 'sea', SUMMER, { az: 'Qatarla dəniz bəndi üzərindən Şimal dənizi adasına — uzun gün.', de: 'Mit dem Zug über den Hindenburgdamm auf die Nordseeinsel – ein langer Tag.', en: 'By train across the Hindenburg causeway to the North Sea island — a long day.', ru: 'На поезде по дамбе Гинденбурга на остров в Северном море — длинный день.' }, { osm: 'Westerland' }),
      t('st-peter-ording', 'St. Peter-Ording', 'St. Peter-Ording', [150, 190], 'RE6 + RB64', 'sea', SUMMER, { az: 'Nəhəng qum çimərliyi və dirəklər üstündə kafelər.', de: 'Riesiger Sandstrand und Pfahlbauten an der Nordsee.', en: 'A huge sandy beach and restaurants on stilts at the North Sea.', ru: 'Огромный песчаный пляж и кафе на сваях у Северного моря.' }),
    ],
  },
  {
    city: 'muenchen',
    station: 'München Hbf',
    trips: [
      t('starnberg', 'Starnberger See', 'Starnberg', [30, 40], 'S6 · RB', 'lake', SPRING_SUMMER, { az: 'Stansiyadan çıxan kimi göl sahili; aydın gündə Alp dağları görünür.', de: 'Seepromenade direkt am Bahnhof, bei Föhn Alpenblick.', en: 'A lake promenade right by the station, with Alpine views on clear days.', ru: 'Набережная прямо у вокзала, в ясные дни виды на Альпы.' }, { osm: 'Starnberg', note: BOAT }),
      t('tegernsee', 'Tegernsee', 'Tegernsee', [60, 70], 'RB57 (BRB)', 'lake', ALL, { az: 'Dağlar arasında göl, gəzinti yolları və Bavariya pivəxanası.', de: 'See zwischen Bergen, Wanderwege und das Bräustüberl.', en: 'A lake between mountains, hiking trails and the monastery brewery tavern.', ru: 'Озеро среди гор, тропы и монастырская пивная.' }),
      t('schliersee', 'Schliersee', 'Schliersee', [55, 65], 'RB55 (BRB)', 'mountains', ALL, { az: 'Kiçik dağ gölü; yayda çimmək, qışda yaxınlıqda xizək.', de: 'Kleiner Bergsee: im Sommer baden, im Winter Rodeln und Ski in der Nähe.', en: 'A small mountain lake: swimming in summer, sledging and skiing nearby in winter.', ru: 'Небольшое горное озеро: летом купание, зимой санки и лыжи рядом.' }),
      t('garmisch', 'Garmisch-Partenkirchen', 'Garmisch-Partenkirchen', [80, 95], 'RB6', 'mountains', ALL, { az: 'Partnachklamm dərəsi və Almaniyanın ən hündür dağı Zugspitze-nin ətəyi.', de: 'Partnachklamm und Bergpanorama am Fuß der Zugspitze.', en: 'The Partnach Gorge and the mountain panorama at the foot of the Zugspitze.', ru: 'Ущелье Партнахкламм и панорама у подножия Цугшпитце.' }, { note: MOUNTAIN_RAIL }),
      t('fuessen', 'Füssen (Neuschwanstein)', 'Füssen', [120, 135], 'RE · RB (via Buchloe)', 'castle', ALL, { az: 'Neuschwanstein və Hohenschwangau qalaları — stansiyadan yerli avtobusla.', de: 'Schlösser Neuschwanstein und Hohenschwangau – ab Bahnhof mit dem Linienbus.', en: 'Neuschwanstein and Hohenschwangau castles — by regular bus from the station.', ru: 'Замки Нойшванштайн и Хоэншвангау — от вокзала на рейсовом автобусе.' }, { osm: 'Schloss Neuschwanstein' }),
      t('chiemsee', 'Prien am Chiemsee', 'Prien am Chiemsee', [55, 65], 'RE5 · RB54', 'lake', WARM, { az: '“Bavariya dənizi” Chiemsee və Herrenchiemsee sarayı.', de: 'Das „Bayerische Meer“ und Schloss Herrenchiemsee.', en: 'The “Bavarian Sea” and Herrenchiemsee palace.', ru: '«Баварское море» и дворец Херренкимзе.' }, { note: BOAT }),
      t('augsburg', 'Augsburg', 'Augsburg Hbf', [30, 45], 'RE9 · RB', 'city', ALL, W.augsburg),
      t('regensburg', 'Regensburg', 'Regensburg Hbf', [80, 100], 'RE · RB (via Landshut)', 'city', ALL, W.regensburg),
      t('landshut', 'Landshut', 'Landshut(Bay)Hbf', [45, 60], 'RE · RB', 'castle', ALL, { az: 'Gotik küçə, Trausnitz qalası və ən hündür kərpic qüllə.', de: 'Gotische Altstadt, Burg Trausnitz und der höchste Backsteinturm der Welt.', en: 'A Gothic old town, Trausnitz castle and the world’s tallest brick tower.', ru: 'Готический старый город, замок Траусниц и самая высокая кирпичная башня.' }),
      t('mittenwald', 'Mittenwald', 'Mittenwald', [105, 120], 'RB6', 'mountains', ALL, { az: 'Rəngli evlər, skripka ustaları və Leutasch dərəsi.', de: 'Lüftlmalerei, Geigenbau und die Leutaschklamm.', en: 'Painted houses, violin makers and the Leutasch Gorge.', ru: 'Расписные дома, скрипичные мастера и ущелье Лойташкламм.' }),
    ],
  },
  {
    city: 'koeln',
    station: 'Köln Hbf',
    trips: [
      t('bonn', 'Bonn', 'Bonn Hbf', [20, 30], 'RE5 · RB48', 'city', ALL, W.bonn),
      t('bruehl', 'Brühl', 'Brühl', [15, 20], 'RE · RB', 'castle', WARM, { az: 'Augustusburg və Falkenlust sarayları (UNESCO), barokko bağlar.', de: 'Schlösser Augustusburg und Falkenlust (UNESCO) mit Barockgarten.', en: 'Augustusburg and Falkenlust palaces (UNESCO) with baroque gardens.', ru: 'Дворцы Аугустусбург и Фалькенлуст (ЮНЕСКО) с барочным садом.' }),
      t('koenigswinter', 'Königswinter (Drachenfels)', 'Königswinter', [40, 55], 'RB27', 'mountains', WARM, { az: 'Drachenfels xarabalığına çıxış və Reyn üzərində mənzərə.', de: 'Aufstieg zum Drachenfels und Blick über den Rhein ins Siebengebirge.', en: 'Climb the Drachenfels and look over the Rhine and the Siebengebirge hills.', ru: 'Подъём на Драхенфельс и вид на Рейн и Зибенгебирге.' }, { osm: 'Drachenfels', note: MOUNTAIN_RAIL }),
      t('aachen', 'Aachen', 'Aachen Hbf', [55, 70], 'RE1 · RE9', 'city', ALL, W.aachen),
      t('koblenz', 'Koblenz', 'Koblenz Hbf', [60, 90], 'RE5 · RB26', 'city', ALL, { az: 'Reyn və Mozelin qovuşduğu Deutsches Eck, Ehrenbreitstein qalası.', de: 'Deutsches Eck am Zusammenfluss von Rhein und Mosel, Festung Ehrenbreitstein.', en: 'The Deutsches Eck where Rhine and Moselle meet, Ehrenbreitstein fortress.', ru: 'Немецкий угол у слияния Рейна и Мозеля, крепость Эренбрайтштайн.' }, { note: MOUNTAIN_RAIL }),
      t('bacharach', 'Bacharach (Oberes Mittelrheintal)', 'Bacharach', [100, 130], 'RB26 (via Koblenz)', 'wine', WARM, { az: 'Reyn dərəsində qalalar və üzüm bağları — UNESCO landşaftı.', de: 'Burgen und Weinberge im Mittelrheintal – UNESCO-Kulturlandschaft.', en: 'Castles and vineyards in the Rhine gorge — a UNESCO landscape.', ru: 'Замки и виноградники в долине Среднего Рейна — ландшафт ЮНЕСКО.' }, { osm: 'Bacharach' }),
      t('bad-muenstereifel', 'Bad Münstereifel', 'Bad Münstereifel', [60, 80], 'RE22 · RB24 + RB23', 'city', ALL, { az: 'Şəhər divarları içində taxta karkaslı evlər və outlet.', de: 'Fachwerk innerhalb der Stadtmauer, kleine Erft und Outlet.', en: 'Half-timbered houses within the town walls, the little Erft river and an outlet centre.', ru: 'Фахверк внутри городских стен, речка Эрфт и аутлет.' }),
      t('duesseldorf', 'Düsseldorf', 'Düsseldorf Hbf', [25, 35], 'RE1 · RE5 · S11', 'city', ALL, W.duesseldorf),
      t('wuppertal', 'Wuppertal', 'Wuppertal Hbf', [30, 45], 'RE7 · S8', 'city', ALL, W.wuppertal),
      t('gerolstein', 'Gerolstein (Vulkaneifel)', 'Gerolstein', [95, 120], 'RE22 · RB24', 'nature', WARM, { az: 'Vulkan Eyfeli: maarlar, qayalar və Eifelsteig yolu.', de: 'Vulkaneifel: Maare, Felsen und Etappen des Eifelsteigs.', en: 'The Volcanic Eifel: crater lakes, rocks and stages of the Eifelsteig trail.', ru: 'Вулканический Айфель: маары, скалы и тропа Айфельштайг.' }),
    ],
  },
  {
    city: 'frankfurt',
    station: 'Frankfurt(Main)Hbf',
    trips: [
      t('mainz', 'Mainz', 'Mainz Hbf', [25, 40], 'S8 · RE', 'city', ALL, { az: 'Qutenberq muzeyi, kafedral və Reyn sahili.', de: 'Gutenberg-Museum, Dom und Rheinufer – Weinstuben in der Altstadt.', en: 'The Gutenberg Museum, the cathedral and the Rhine bank — wine taverns in the old town.', ru: 'Музей Гутенберга, собор и берег Рейна — винные погребки.' }),
      t('wiesbaden', 'Wiesbaden', 'Wiesbaden Hbf', [30, 45], 'S1 · S8 · RB', 'city', ALL, { az: 'Kurort şəhəri: isti bulaqlar, Kurhaus və Neroberg.', de: 'Kurstadt mit Thermalquellen, Kurhaus und Neroberg.', en: 'A spa town with hot springs, the Kurhaus and the Neroberg hill.', ru: 'Курорт с термальными источниками, Курхаус и гора Неро.' }),
      t('ruedesheim', 'Rüdesheim am Rhein', 'Rüdesheim(Rhein)', [60, 80], 'RB10', 'wine', WARM, { az: 'Üzüm bağları, Drosselgasse və Niederwald abidəsi.', de: 'Weinberge, Drosselgasse und Niederwalddenkmal.', en: 'Vineyards, the Drosselgasse lane and the Niederwald monument.', ru: 'Виноградники, улочка Дроссельгассе и памятник Нидервальд.' }, { note: MOUNTAIN_RAIL }),
      t('heidelberg', 'Heidelberg', 'Heidelberg Hbf', [60, 90], 'RE60 · S-Bahn', 'city', ALL, W.heidelberg),
      t('marburg', 'Marburg', 'Marburg(Lahn)', [55, 70], 'RE30 · RB41', 'city', ALL, { az: 'Dik küçələr, qala və Qrimm qardaşlarının universiteti.', de: 'Steile Gassen, Landgrafenschloss und Uni-Stadt der Brüder Grimm.', en: 'Steep lanes, the landgraves’ castle and the university of the Brothers Grimm.', ru: 'Крутые улочки, замок ландграфов и университет братьев Гримм.' }),
      t('darmstadt', 'Darmstadt', 'Darmstadt Hbf', [15, 30], 'RE · S3 · S4', 'city', ALL, { az: 'Mathildenhöhe — Art Nouveau rəssamlar koloniyası (UNESCO).', de: 'Mathildenhöhe – Jugendstil-Künstlerkolonie (UNESCO).', en: 'Mathildenhöhe — an Art Nouveau artists’ colony (UNESCO).', ru: 'Матильденхёэ — колония художников модерна (ЮНЕСКО).' }),
      t('wuerzburg', 'Würzburg', 'Würzburg Hbf', [110, 130], 'RE54 · RE55', 'wine', ALL, W.wuerzburg),
      t('bad-homburg', 'Bad Homburg (Saalburg)', 'Bad Homburg', [20, 30], 'S5', 'nature', ALL, { az: 'Kurpark və yenidən qurulmuş Roma qalası Saalburg (avtobusla).', de: 'Kurpark und das rekonstruierte Römerkastell Saalburg (mit dem Bus).', en: 'The spa park and the reconstructed Roman fort Saalburg (by bus).', ru: 'Курпарк и реконструированный римский форт Заальбург (на автобусе).' }),
      t('limburg', 'Limburg an der Lahn', 'Limburg(Lahn)', [60, 80], 'RE20 · RB22', 'city', ALL, { az: 'Qaya üzərində yeddi qülləli kafedral və taxta karkaslı evlər.', de: 'Dom mit sieben Türmen auf dem Felsen und Fachwerk-Altstadt.', en: 'A seven-towered cathedral on a rock and a half-timbered old town.', ru: 'Собор с семью башнями на скале и фахверковый старый город.' }),
      t('aschaffenburg', 'Aschaffenburg', 'Aschaffenburg Hbf', [35, 45], 'RE54 · RE55 · RB', 'castle', ALL, { az: 'Main sahilində qırmızı daşdan Johannisburg sarayı və Pompejanum.', de: 'Schloss Johannisburg aus rotem Sandstein am Main und das Pompejanum.', en: 'Johannisburg palace in red sandstone on the Main and the Pompejanum villa.', ru: 'Дворец Йоханнисбург из красного песчаника на Майне и Помпеянум.' }),
    ],
  },
  {
    city: 'stuttgart',
    station: 'Stuttgart Hbf',
    trips: [
      t('esslingen', 'Esslingen am Neckar', 'Esslingen(Neckar)', [10, 15], 'S1 · RE', 'city', ALL, { az: 'Orta əsr köhnə şəhəri; dekabrda orta əsr Milad bazarı.', de: 'Mittelalterliche Altstadt; im Dezember der Mittelalter-Weihnachtsmarkt.', en: 'A medieval old town; in December the medieval Christmas market.', ru: 'Средневековый город; в декабре средневековая рождественская ярмарка.' }),
      t('ludwigsburg', 'Ludwigsburg', 'Ludwigsburg', [10, 20], 'S4 · S5 · MEX', 'castle', ALL, { az: 'Böyük barokko sarayı və bağı; payızda balqabaq festivalı.', de: 'Residenzschloss, Blühendes Barock und im Herbst die Kürbisausstellung.', en: 'The baroque residence, its gardens and the pumpkin festival in autumn.', ru: 'Барочная резиденция, сады и выставка тыкв осенью.' }),
      t('tuebingen', 'Tübingen', 'Tübingen Hbf', [45, 65], 'MEX12 · RE', 'city', WARM, { az: 'Universitet şəhəri, Neckar çayında Stocherkahn qayıqları.', de: 'Uni-Stadt mit Stocherkahnfahrten auf dem Neckar.', en: 'A university town with punts on the Neckar.', ru: 'Университетский город, плоскодонки на Неккаре.' }),
      t('hohenzollern', 'Burg Hohenzollern (Hechingen)', 'Hechingen', [75, 95], 'RB (via Tübingen)', 'castle', WARM, { az: 'Dağ başında qala — Hechingen-dən avtobus/şatl və ya piyada.', de: 'Burg auf dem Bergkegel – ab Hechingen Bus/Shuttle oder Fußweg.', en: 'A castle on a hilltop — from Hechingen by bus/shuttle or on foot.', ru: 'Замок на вершине горы — от Хехингена автобус/шаттл или пешком.' }, { osm: 'Burg Hohenzollern', note: { az: 'Qalaya şatl ayrıca ödənişli ola bilər.', de: 'Der Burg-Shuttle kann extra kosten.', en: 'The castle shuttle may cost extra.', ru: 'Шаттл к замку может стоить отдельно.' } }),
      t('ulm', 'Ulm', 'Ulm Hbf', [55, 75], 'MEX16 · RE', 'city', ALL, { az: 'Dünyanın ən hündür kilsə qülləsi və Balıqçılar məhəlləsi.', de: 'Höchster Kirchturm der Welt und das Fischerviertel an der Donau.', en: 'The world’s tallest church spire and the Fishermen’s Quarter on the Danube.', ru: 'Самая высокая церковная башня мира и Рыбацкий квартал на Дунае.' }),
      t('blaubeuren', 'Blaubeuren (Blautopf)', 'Blaubeuren', [80, 100], 'MEX16 + RB (via Ulm)', 'nature', WARM, { az: 'Firuzəyi rəngli karst bulağı Blautopf və monastır.', de: 'Der türkisblaue Karstquelltopf Blautopf und das Kloster.', en: 'The turquoise karst spring Blautopf and the monastery.', ru: 'Бирюзовый карстовый источник Блаутопф и монастырь.' }, { osm: 'Blautopf' }),
      t('schwaebisch-hall', 'Schwäbisch Hall', 'Schwäbisch Hall-Hessental', [60, 85], 'RE · MEX', 'city', ALL, { az: 'Taxta karkaslı köhnə şəhər və kilsə pilləkənləri.', de: 'Fachwerk-Altstadt, Kocherufer und die große Freitreppe.', en: 'A half-timbered old town on the Kocher river and the great church steps.', ru: 'Фахверковый город на реке Кохер и большая лестница к церкви.' }),
      t('heidelberg-s', 'Heidelberg', 'Heidelberg Hbf', [90, 120], 'RE · MEX (via Bruchsal)', 'city', ALL, W.heidelberg),
      t('baden-baden', 'Baden-Baden', 'Baden-Baden', [75, 100], 'RE (via Karlsruhe)', 'city', ALL, { az: 'Termal hamamlar, Kurhaus və Lichtentaler Allee parkı.', de: 'Thermen, Kurhaus und die Lichtentaler Allee.', en: 'Thermal baths, the Kurhaus and the Lichtentaler Allee park.', ru: 'Термы, Курхаус и аллея Лихтенталер.' }),
      t('bad-urach', 'Bad Urach', 'Bad Urach', [60, 75], 'MEX12 + RB (via Metzingen)', 'nature', WARM, { az: 'Uracher şəlaləsi və Şvab Albının qayaları.', de: 'Uracher Wasserfall und Felsen der Schwäbischen Alb.', en: 'The Urach waterfall and the cliffs of the Swabian Jura.', ru: 'Урахский водопад и скалы Швабского Альба.' }),
    ],
  },
  {
    city: 'duesseldorf',
    station: 'Düsseldorf Hbf',
    trips: [
      t('koeln-d', 'Köln', 'Köln Hbf', [25, 35], 'RE1 · RE5 · S11', 'city', ALL, W.koeln),
      t('bonn-d', 'Bonn', 'Bonn Hbf', [50, 70], 'RE5', 'city', ALL, W.bonn),
      t('aachen-d', 'Aachen', 'Aachen Hbf', [75, 95], 'RE4', 'city', ALL, W.aachen),
      t('muenster-d', 'Münster', 'Münster(Westf)Hbf', [75, 100], 'RE2', 'city', ALL, W.muenster),
      t('xanten-d', 'Xanten', 'Xanten', [75, 100], 'RE + RB31 (via Duisburg)', 'city', WARM, W.xanten),
      t('wuppertal-d', 'Wuppertal', 'Wuppertal Hbf', [20, 30], 'S8 · RE4', 'city', ALL, W.wuppertal),
      t('neandertal', 'Neandertal', 'Neanderthal', [20, 30], 'S28', 'nature', ALL, { az: 'Neandertal adamının tapıldığı dərə və muzey.', de: 'Fundort des Neandertalers mit Museum und Wildgehege.', en: 'The valley where Neanderthal man was found, with a museum and wildlife park.', ru: 'Долина, где нашли неандертальца: музей и вольеры с животными.' }, { osm: 'Neanderthal Museum' }),
      t('zollverein-d', 'Essen: Zeche Zollverein', 'Essen Hbf', [25, 40], 'RE · S + tram 107', 'industrial', ALL, W.zollverein, { osm: 'Zeche Zollverein' }),
      t('landschaftspark-d', 'Landschaftspark Duisburg-Nord', 'Duisburg Hbf', [25, 40], 'RE · S1 + tram 903', 'industrial', ALL, W.landschaftspark, { osm: 'Landschaftspark Duisburg-Nord' }),
      t('haltern-d', 'Haltern am See', 'Haltern am See', [60, 80], 'RE2', 'lake', SUMMER, W.haltern),
    ],
  },
  {
    city: 'leipzig',
    station: 'Leipzig Hbf',
    trips: [
      t('halle', 'Halle (Saale)', 'Halle(Saale)Hbf', [25, 40], 'S3 · S5 · RE', 'city', ALL, { az: 'Hendelin doğulduğu şəhər, Francke fondu və Saale sahili.', de: 'Händels Geburtsstadt, Franckesche Stiftungen und die Saale.', en: 'Handel’s birthplace, the Francke Foundations and the Saale river.', ru: 'Родина Генделя, Фонды Франке и река Зале.' }),
      t('cospudener-see', 'Cospudener See', 'Markkleeberg', [15, 25], 'S3 · S5', 'lake', SUMMER, { az: 'Keçmiş kömür karxanasından yaranmış göl: çimərlik və velosiped yolu.', de: 'Ehemaliger Tagebau, heute See mit Stränden und Rundweg.', en: 'A former open-cast mine, now a lake with beaches and a loop trail.', ru: 'Бывший карьер, теперь озеро с пляжами и кольцевой тропой.' }),
      t('naumburg', 'Naumburg & Freyburg (Saale-Unstrut)', 'Naumburg(Saale)Hbf', [45, 70], 'RE · RB', 'wine', WARM, { az: 'Naumburq kafedralı (UNESCO) və Almaniyanın ən şimal şərab bölgəsi.', de: 'Naumburger Dom (UNESCO) und das nördlichste Qualitätsweingebiet.', en: 'Naumburg Cathedral (UNESCO) and Germany’s northernmost quality wine region.', ru: 'Наумбургский собор (ЮНЕСКО) и самый северный винный регион.' }, { osm: 'Naumburg (Saale)' }),
      t('weimar', 'Weimar', 'Weimar', [70, 100], 'RE · RB', 'city', ALL, { az: 'Höte və Şiller, Bauhaus muzeyi — klassika şəhəri.', de: 'Goethe und Schiller, Bauhaus-Museum und Ilmpark.', en: 'Goethe and Schiller, the Bauhaus Museum and the Ilm park.', ru: 'Гёте и Шиллер, музей Баухауса и парк на Ильме.' }),
      t('wittenberg-l', 'Lutherstadt Wittenberg', 'Lutherstadt Wittenberg Hbf', [35, 60], 'S2 · RE', 'city', ALL, W.wittenberg),
      t('dresden-l', 'Dresden', 'Dresden Hbf', [95, 115], 'RE50', 'city', ALL, W.dresden),
      t('meissen-l', 'Meißen', 'Meißen', [90, 120], 'RE50 + S1', 'city', ALL, W.meissen),
      t('grimma', 'Grimma', 'Grimma ob Bf', [30, 45], 'RE6 · S', 'nature', WARM, { az: 'Mulde çayı dərəsi, köhnə şəhər və asma körpü.', de: 'Muldental, Altstadt und die Hängebrücke über die Mulde.', en: 'The Mulde valley, the old town and the suspension bridge.', ru: 'Долина Мульде, старый город и подвесной мост.' }, { osm: 'Grimma' }),
      t('altenburg', 'Altenburg', 'Altenburg', [40, 50], 'S5 · S5X', 'castle', ALL, { az: 'Skat kart oyununun vətəni: saray və oyun kartları muzeyi.', de: 'Skatstadt: Residenzschloss mit Spielkartenmuseum.', en: 'Home of the card game Skat: palace with a playing-card museum.', ru: 'Родина игры скат: дворец с музеем игральных карт.' }),
      t('quedlinburg', 'Quedlinburg', 'Quedlinburg', [130, 170], 'RE · RB (via Halle/Halberstadt)', 'city', ALL, { az: '1300-dən çox taxta karkaslı ev — UNESCO köhnə şəhəri.', de: 'Über 1.300 Fachwerkhäuser – UNESCO-Welterbe am Harz.', en: 'More than 1,300 half-timbered houses — UNESCO World Heritage by the Harz.', ru: 'Более 1300 фахверковых домов — наследие ЮНЕСКО у Гарца.' }),
    ],
  },
  {
    city: 'dresden',
    station: 'Dresden Hbf',
    trips: [
      t('meissen-dd', 'Meißen', 'Meißen', [30, 40], 'S1', 'city', ALL, W.meissen),
      t('radebeul', 'Radebeul', 'Radebeul Ost', [10, 15], 'S1', 'wine', WARM, { az: 'Elba üzüm bağları, Karl May muzeyi.', de: 'Elbweinberge, Spitzhaus und das Karl-May-Museum.', en: 'Elbe vineyards, the Spitzhaus and the Karl May Museum.', ru: 'Виноградники на Эльбе, Шпитцхаус и музей Карла Мая.' }),
      t('pirna', 'Pirna', 'Pirna', [20, 25], 'S1 · S2', 'city', ALL, { az: 'Kanalettonun rəsmlərindəki köhnə şəhər, Sakson İsveçrəsinin qapısı.', de: 'Canaletto-Altstadt und Tor zur Sächsischen Schweiz.', en: 'The old town painted by Canaletto, gateway to Saxon Switzerland.', ru: 'Старый город с полотен Каналетто, ворота в Саксонскую Швейцарию.' }),
      t('bastei', 'Kurort Rathen (Bastei)', 'Kurort Rathen', [40, 45], 'S1', 'nature', WARM, { az: 'Qumdaşı qayaları arasında Bastei körpüsü — ən məşhur mənzərə.', de: 'Basteibrücke zwischen Sandsteinfelsen – der berühmteste Ausblick.', en: 'The Bastei bridge between sandstone rocks — the most famous view.', ru: 'Мост Бастай между скалами из песчаника — самый известный вид.' }, { osm: 'Bastei', note: { az: 'Stansiyadan kəndə Elba bərəsi ayrıca bilet tələb edə bilər.', de: 'Die Elbfähre vom Bahnhof in den Ort kann ein eigenes Ticket brauchen.', en: 'The Elbe ferry from the station to the village may need its own ticket.', ru: 'Паром через Эльбу от станции может требовать отдельный билет.' } }),
      t('bad-schandau', 'Bad Schandau', 'Bad Schandau', [45, 55], 'S1', 'nature', WARM, { az: 'Kirnitzschtal tramvayı və Sakson İsveçrəsində yürüş.', de: 'Kirnitzschtalbahn und Wandern im Nationalpark Sächsische Schweiz.', en: 'The Kirnitzsch valley tram and hiking in Saxon Switzerland National Park.', ru: 'Трамвай Кирничталь и походы в нацпарке Саксонская Швейцария.' }),
      t('bautzen', 'Bautzen', 'Bautzen', [50, 60], 'RE1 · RB60', 'city', ALL, { az: 'Qüllələr şəhəri, sorb mədəniyyəti və məşhur xardal.', de: 'Stadt der Türme, sorbische Kultur und Bautzner Senf.', en: 'City of towers, Sorbian culture and Bautzen mustard.', ru: 'Город башен, лужицкая культура и бауценская горчица.' }),
      t('goerlitz', 'Görlitz', 'Görlitz', [80, 95], 'RE1 · RB60', 'city', ALL, { az: 'Filmlərin çəkildiyi köhnə şəhər; körpüdən Polşaya keçid.', de: 'Filmkulisse-Altstadt; über die Neiße nach Zgorzelec in Polen.', en: 'A film-set old town; walk over the Neisse to Zgorzelec in Poland.', ru: 'Старый город-кинодекорация; через Нейсе в польский Згожелец.' }),
      t('freiberg', 'Freiberg', 'Freiberg(Sachs)', [30, 45], 'RB30 · RE3', 'city', ALL, { az: 'Gümüş mədəni şəhəri və mineral kolleksiyası terra mineralia.', de: 'Silberbergbau-Stadt mit der Mineraliensammlung terra mineralia.', en: 'A silver-mining town with the terra mineralia mineral collection.', ru: 'Город серебряных рудников и коллекция минералов terra mineralia.' }),
      t('leipzig-dd', 'Leipzig', 'Leipzig Hbf', [95, 115], 'RE50', 'city', ALL, W.leipzig),
      t('zittau', 'Zittauer Gebirge', 'Zittau', [100, 130], 'RE2 · RB', 'mountains', WARM, { az: 'Almaniyanın ən kiçik dağları: qayalar və taxta-daş evlər.', de: 'Kleinstes Mittelgebirge Deutschlands: Felsen und Umgebindehäuser.', en: 'Germany’s smallest low mountain range: rocks and traditional Umgebinde houses.', ru: 'Самые маленькие горы Германии: скалы и дома умгебинде.' }, { osm: 'Zittauer Gebirge', note: { az: 'Dar relsli buxar qatarı biletə daxil deyil.', de: 'Die Schmalspurbahn ist nicht enthalten.', en: 'The narrow-gauge steam railway is not included.', ru: 'Узкоколейка не входит в билет.' } }),
    ],
  },
  {
    city: 'hannover',
    station: 'Hannover Hbf',
    trips: [
      t('hildesheim', 'Hildesheim', 'Hildesheim Hbf', [25, 35], 'S3 · RE', 'city', ALL, { az: 'UNESCO kafedralı və 1000 illik qızılgül kolu.', de: 'Dom und Michaeliskirche (UNESCO) mit dem tausendjährigen Rosenstock.', en: 'The cathedral and St Michael’s (UNESCO) with the thousand-year-old rose bush.', ru: 'Собор и церковь Святого Михаила (ЮНЕСКО) с тысячелетним розовым кустом.' }),
      t('celle', 'Celle', 'Celle', [20, 40], 'S6 · S7 · RE', 'city', ALL, { az: '400-dən çox taxta karkaslı ev və ağ saray.', de: 'Über 400 Fachwerkhäuser und das weiße Residenzschloss.', en: 'More than 400 half-timbered houses and the white palace.', ru: 'Более 400 фахверковых домов и белый дворец.' }),
      t('hameln', 'Hameln', 'Hameln', [45, 50], 'S5', 'city', WARM, { az: 'Fleytaçalan nağılının şəhəri; yayda bazar günləri tamaşa.', de: 'Rattenfängerstadt; sonntags im Sommer Freilichtspiel.', en: 'Town of the Pied Piper, with an open-air play on summer Sundays.', ru: 'Город Крысолова; летом по воскресеньям уличный спектакль.' }),
      t('goslar', 'Goslar', 'Goslar', [65, 80], 'RE10 · ERX', 'mountains', ALL, { az: 'Harz dağlarının ətəyində UNESCO mədəni və imperator sarayı.', de: 'Kaiserpfalz und Bergwerk Rammelsberg (UNESCO) am Harzrand.', en: 'The imperial palace and the Rammelsberg mine (UNESCO) at the edge of the Harz.', ru: 'Императорский пфальц и рудник Раммельсберг (ЮНЕСКО) у Гарца.' }),
      t('braunschweig', 'Braunschweig', 'Braunschweig Hbf', [35, 45], 'RE60 · RE70', 'city', ALL, { az: 'Aslan şəhəri: Dankwarderode qalası və kafedral.', de: 'Löwenstadt mit Burg Dankwarderode und Dom.', en: 'The lion city with Dankwarderode castle and the cathedral.', ru: 'Город льва: замок Данкварде­роде и собор.' }),
      t('wolfenbuettel', 'Wolfenbüttel', 'Wolfenbüttel', [50, 65], 'RE + RB (via Braunschweig)', 'city', ALL, { az: 'Herzog August kitabxanası və Yägermeisterin vətəni.', de: 'Herzog August Bibliothek, Schloss und Fachwerk-Altstadt.', en: 'The Herzog August Library, the palace and a half-timbered old town.', ru: 'Библиотека герцога Августа, дворец и фахверк.' }),
      t('steinhude', 'Steinhuder Meer', 'Wunstorf', [30, 50], 'S1 · S2 + bus', 'lake', SUMMER, { az: 'Aşağı Saksoniyanın ən böyük gölü: yelkən, velosiped, hisə verilmiş balıq.', de: 'Größter See Niedersachsens: Segeln, Radeln und Räucheraal.', en: 'Lower Saxony’s largest lake: sailing, cycling and smoked eel.', ru: 'Самое большое озеро Нижней Саксонии: парусники, велосипед и копчёный угорь.' }, { osm: 'Steinhude', note: BOAT }),
      t('bad-pyrmont', 'Bad Pyrmont', 'Bad Pyrmont', [55, 70], 'S5', 'nature', ALL, { az: 'Palma bağı olan kurort parkı.', de: 'Kurpark mit Palmengarten und Hufeisen-Allee.', en: 'A spa park with a palm garden.', ru: 'Курортный парк с пальмовым садом.' }),
      t('lueneburg-h', 'Lüneburg', 'Lüneburg', [80, 100], 'RE2 · metronom (via Uelzen)', 'city', ALL, W.lueneburg),
      t('bremen-h', 'Bremen', 'Bremen Hbf', [70, 90], 'RE1 · RE8', 'city', ALL, W.bremen),
    ],
  },
  {
    city: 'nuernberg',
    station: 'Nürnberg Hbf',
    trips: [
      t('fuerth', 'Fürth', 'Fürth(Bay)Hbf', [5, 10], 'S1 · RE · U1', 'city', ALL, { az: 'Yaxın qonşu: Jugendstil binaları və rahat köhnə şəhər.', de: 'Nachbarstadt mit Gründerzeit-Fassaden und gemütlicher Altstadt.', en: 'The neighbouring town with 19th-century façades and a cosy old town.', ru: 'Соседний город с фасадами грюндерской эпохи и уютным центром.' }),
      t('erlangen', 'Erlangen', 'Erlangen', [15, 25], 'S1 · RE', 'city', ['spring', 'summer'], { az: 'Universitet şəhəri; Pentikost vaxtı Bergkirchweih festivalı.', de: 'Uni-Stadt mit Schlossgarten; zu Pfingsten die Bergkirchweih.', en: 'A university town with a palace garden; at Pentecost the Bergkirchweih fair.', ru: 'Университетский город; на Троицу пивной фестиваль Бергкирхвайх.' }),
      t('bamberg', 'Bamberg', 'Bamberg', [40, 60], 'S1 · RE', 'city', ALL, { az: 'UNESCO köhnə şəhəri, çay üstündə bələdiyyə binası və hisə verilmiş pivə.', de: 'UNESCO-Altstadt, Rathaus im Fluss und Rauchbier.', en: 'A UNESCO old town, the town hall in the river and smoked beer.', ru: 'Старый город ЮНЕСКО, ратуша посреди реки и копчёное пиво.' }),
      t('bayreuth', 'Bayreuth', 'Bayreuth Hbf', [60, 80], 'RE', 'city', ALL, { az: 'Marqraf opera teatrı (UNESCO) və Vaqner festivalı.', de: 'Markgräfliches Opernhaus (UNESCO) und die Wagner-Festspiele.', en: 'The Margravial Opera House (UNESCO) and the Wagner festival.', ru: 'Маркграфский оперный театр (ЮНЕСКО) и Вагнеровский фестиваль.' }),
      t('hersbruck', 'Hersbruck (Pegnitztal)', 'Hersbruck(r Pegn)', [20, 35], 'S1 · RE', 'nature', WARM, { az: 'Frank Yurasında yürüş yolları və qayalar.', de: 'Wandern in der Hersbrucker Schweiz, Felsen und Höhlen.', en: 'Hiking in the “Hersbruck Switzerland” hills, rocks and caves.', ru: 'Походы в «Херсбрукской Швейцарии», скалы и пещеры.' }, { osm: 'Hersbruck' }),
      t('regensburg-n', 'Regensburg', 'Regensburg Hbf', [60, 90], 'RE · RB', 'city', ALL, W.regensburg),
      t('wuerzburg-n', 'Würzburg', 'Würzburg Hbf', [60, 75], 'RE', 'wine', ALL, W.wuerzburg),
      t('rothenburg', 'Rothenburg ob der Tauber', 'Rothenburg ob der Tauber', [70, 100], 'RE · RB (via Ansbach, Steinach)', 'city', ['spring', 'summer', 'autumn', 'winter'], { az: 'Divarla əhatə olunmuş orta əsr şəhəri; dekabrda Milad bazarı.', de: 'Mittelalterstadt mit begehbarer Stadtmauer; im Advent Reiterlesmarkt.', en: 'A walled medieval town with a walkable wall; Christmas market in Advent.', ru: 'Средневековый город с крепостной стеной; в адвент рождественская ярмарка.' }),
      t('ansbach', 'Ansbach', 'Ansbach', [30, 45], 'S4 · RE', 'castle', ALL, { az: 'Marqraf iqamətgahı və Hofgarten bağı.', de: 'Markgräfliche Residenz und Hofgarten mit Orangerie.', en: 'The Margrave’s residence and court garden with orangery.', ru: 'Маркграфская резиденция и придворный сад с оранжереей.' }),
      t('coburg', 'Coburg', 'Coburg', [75, 100], 'RE (via Bamberg)', 'castle', ALL, { az: 'Təpədə Veste Coburg qalası və köhnə şəhər.', de: 'Veste Coburg hoch über der Stadt und Coburger Bratwurst.', en: 'The Veste Coburg fortress above the town and Coburg bratwurst.', ru: 'Крепость Кобург над городом и кобургские колбаски.' }),
    ],
  },
  {
    city: 'dortmund',
    station: 'Dortmund Hbf',
    trips: [
      t('muenster-do', 'Münster', 'Münster(Westf)Hbf', [30, 50], 'RE7 · RB50 · RB89', 'city', ALL, W.muenster),
      t('soest', 'Soest', 'Soest', [35, 50], 'RB59 · RE', 'city', ALL, { az: 'Yaşıl qumdaşı kilsələr; noyabrda Allerheiligenkirmes yarmarkası.', de: 'Kirchen aus Grünsandstein; im November die Allerheiligenkirmes.', en: 'Churches of green sandstone; in November the All Saints’ fair.', ru: 'Церкви из зелёного песчаника; в ноябре ярмарка Всех Святых.' }),
      t('paderborn', 'Paderborn', 'Paderborn Hbf', [60, 80], 'RE · RB', 'city', ALL, { az: 'Kafedral, Pader çayının 200 bulağı və kompüter muzeyi.', de: 'Dom, die 200 Quellen der Pader und das Computermuseum HNF.', en: 'The cathedral, the 200 springs of the Pader and the computer museum.', ru: 'Собор, 200 источников реки Падер и компьютерный музей.' }),
      t('zollverein-do', 'Essen: Zeche Zollverein', 'Essen Hbf', [25, 40], 'RE + tram 107', 'industrial', ALL, W.zollverein, { osm: 'Zeche Zollverein' }),
      t('wuppertal-do', 'Wuppertal', 'Wuppertal Hbf', [35, 50], 'RE4 · RE7', 'city', ALL, W.wuppertal),
      t('koeln-do', 'Köln', 'Köln Hbf', [70, 95], 'RE1 · RE6', 'city', ALL, W.koeln),
      t('moehnesee', 'Möhnesee', 'Soest', [60, 90], 'RB59 + bus', 'lake', SUMMER, { az: 'Sauerlandın girişində böyük su anbarı və bənd.', de: 'Großer Stausee mit Staumauer am Rand des Sauerlands.', en: 'A large reservoir with a dam at the edge of the Sauerland.', ru: 'Большое водохранилище с плотиной на краю Зауэрланда.' }, { osm: 'Möhnesee' }),
      t('winterberg', 'Winterberg (Sauerland)', 'Winterberg(Westf)', [120, 150], 'RE57 (via Hagen/Bestwig)', 'mountains', ['summer', 'winter'], { az: 'Qışda xizək, yayda velosiped və yürüş; Rothaarsteig yolu.', de: 'Im Winter Ski, im Sommer Bikepark und Rothaarsteig.', en: 'Skiing in winter, bike park and the Rothaarsteig trail in summer.', ru: 'Зимой лыжи, летом байкпарк и тропа Ротхарштайг.' }, { osm: 'Winterberg', note: MOUNTAIN_RAIL }),
      t('altena', 'Altena (Burg)', 'Altena(Westf)', [45, 65], 'RE16 · RB91 (via Hagen)', 'castle', ALL, { az: 'Dünyanın ilk gənclər yataqxanası olan qala — liftlə yuxarı.', de: 'Burg Altena mit der ersten Jugendherberge der Welt – Erlebnisaufzug nach oben.', en: 'Altena castle with the world’s first youth hostel — a lift takes you up.', ru: 'Замок Альтена с первым в мире молодёжным хостелом — наверх на лифте.' }, { osm: 'Burg Altena' }),
      t('hattingen-do', 'Hattingen', 'Hattingen(Ruhr)', [45, 65], 'S1 + S3 (via Essen/Bochum)', 'city', WARM, W.hattingen),
    ],
  },
  {
    city: 'bremen',
    station: 'Bremen Hbf',
    trips: [
      t('bremerhaven', 'Bremerhaven', 'Bremerhaven Hbf', [35, 50], 'RS2 · RE8 · RE9', 'sea', ALL, { az: 'Mühacirlər evi, Klimahaus və Şimal dənizinə açılan liman.', de: 'Deutsches Auswandererhaus, Klimahaus und Häfen an der Wesermündung.', en: 'The German Emigration Center, the Klimahaus and harbours at the mouth of the Weser.', ru: 'Дом эмигрантов, Климахаус и гавани в устье Везера.' }),
      t('oldenburg', 'Oldenburg', 'Oldenburg(Oldb)', [25, 35], 'RE18 · RS3', 'city', ALL, { az: 'Piyada küçələri, saray və Schlossgarten parkı.', de: 'Fußgängerzone, Schloss und Schlossgarten.', en: 'Pedestrian streets, the palace and its park.', ru: 'Пешеходные улицы, дворец и дворцовый парк.' }),
      t('verden', 'Verden (Aller)', 'Verden(Aller)', [20, 30], 'RS1 · RE8', 'city', ALL, { az: 'At şəhəri və kafedral, Aller çayı boyunca gəzinti.', de: 'Reiterstadt mit Dom und Spazierwegen an der Aller.', en: 'A horse town with a cathedral and walks along the Aller.', ru: 'Город конников с собором и прогулками вдоль Аллера.' }),
      t('hamburg-hb', 'Hamburg', 'Hamburg Hbf', [65, 85], 'RE4 · RB41', 'city', ALL, W.hamburg),
      t('cuxhaven-hb', 'Cuxhaven', 'Cuxhaven', [100, 130], 'RS2 + RB33 (via Bremerhaven)', 'sea', SUMMER, W.cuxhaven),
      t('norddeich', 'Norddeich (Nordsee)', 'Norddeich Mole', [120, 160], 'RE1 · RE (via Oldenburg, Emden)', 'sea', SUMMER, { az: 'Şimal dənizi sahili, suiti xilasetmə mərkəzi; adalara bərə buradan.', de: 'Nordseeküste, Seehundstation; von hier fahren Fähren auf die Inseln.', en: 'North Sea coast and a seal sanctuary; ferries to the islands leave here.', ru: 'Побережье Северного моря и станция тюленей; отсюда паромы на острова.' }, { osm: 'Norddeich', note: BOAT }),
      t('leer', 'Leer (Ostfriesland)', 'Leer(Ostfriesl)', [70, 90], 'RE · RB', 'city', ALL, { az: 'Şərqi Friz çay ənənəsi: çay muzeyi və liman.', de: 'Ostfriesische Teekultur: Teemuseum und Museumshafen.', en: 'East Frisian tea culture: tea museum and the museum harbour.', ru: 'Восточнофризская чайная культура: музей чая и гавань.' }),
      t('papenburg', 'Papenburg', 'Papenburg(Ems)', [80, 110], 'RE · RB (via Oldenburg/Leer)', 'industrial', ALL, { az: 'Nəhəng kruiz gəmilərinin tikildiyi Meyer Werft (bələdçi ilə tur).', de: 'Meyer Werft, wo Kreuzfahrtschiffe gebaut werden (Führungen), und Kanäle.', en: 'Meyer Werft, where cruise ships are built (guided tours), and canals.', ru: 'Верфь Meyer, где строят круизные лайнеры (экскурсии), и каналы.' }),
      t('bad-zwischenahn', 'Bad Zwischenahn', 'Bad Zwischenahn', [35, 55], 'RE18 · RB (via Oldenburg)', 'lake', WARM, { az: 'Zwischenahner Meer gölü, park və hisə verilmiş ilanbalığı.', de: 'Zwischenahner Meer, Kurpark und Räucheraal.', en: 'The Zwischenahner Meer lake, the spa park and smoked eel.', ru: 'Озеро Цвишенанер-Мер, курпарк и копчёный угорь.' }),
      t('osnabrueck', 'Osnabrück', 'Osnabrück Hbf', [70, 90], 'RE9 · RB58', 'city', ALL, W.osnabrueck),
    ],
  },
  {
    city: 'essen',
    station: 'Essen Hbf',
    trips: [
      t('baldeneysee', 'Baldeneysee', 'Essen-Werden', [15, 25], 'S6', 'lake', SUMMER, { az: 'Ruhr üzərində göl: çimərlik zolağı, velosiped və Werden köhnə şəhəri.', de: 'Ruhrsee mit Seaside Beach, Radweg und der Altstadt von Werden.', en: 'A Ruhr lake with a city beach, cycle path and Werden’s old town.', ru: 'Озеро на Руре: городской пляж, велодорожка и старый Верден.' }, { osm: 'Baldeneysee', note: BOAT }),
      t('gasometer', 'Gasometer Oberhausen', 'Oberhausen Hbf', [15, 30], 'RE · S3 + bus', 'industrial', ALL, { az: 'Köhnə qaz çəni içində nəhəng sərgilər; damdan Ruhr mənzərəsi.', de: 'Riesige Ausstellungen in einem alten Gasspeicher, Blick vom Dach.', en: 'Huge exhibitions inside an old gas holder, with a view from the roof.', ru: 'Огромные выставки в старом газгольдере и вид с крыши.' }),
      t('landschaftspark-e', 'Landschaftspark Duisburg-Nord', 'Duisburg Hbf', [25, 40], 'RE + tram 903', 'industrial', ALL, W.landschaftspark, { osm: 'Landschaftspark Duisburg-Nord' }),
      t('hattingen-e', 'Hattingen', 'Hattingen(Ruhr)', [25, 35], 'S3', 'city', WARM, W.hattingen),
      t('wuppertal-e', 'Wuppertal', 'Wuppertal Hbf', [30, 40], 'S9 · RE49', 'city', ALL, W.wuppertal),
      t('duesseldorf-e', 'Düsseldorf', 'Düsseldorf Hbf', [25, 35], 'RE1 · RE2 · S6', 'city', ALL, W.duesseldorf),
      t('koeln-e', 'Köln', 'Köln Hbf', [45, 65], 'RE1 · S6', 'city', ALL, W.koeln),
      t('haltern-e', 'Haltern am See', 'Haltern am See', [30, 45], 'RE42', 'lake', SUMMER, W.haltern),
      t('muenster-e', 'Münster', 'Münster(Westf)Hbf', [50, 75], 'RE42 · RE2', 'city', ALL, W.muenster),
      t('xanten-e', 'Xanten', 'Xanten', [60, 85], 'RE + RB31 (via Duisburg)', 'city', WARM, W.xanten),
    ],
  },
];

export const tripOrigin = (city: string | null | undefined) => TRIP_ORIGINS.find((o) => o.city === city);

/** Long-distance products the Deutschlandticket does not cover (a line label containing one of these is a bug). */
export const LONG_DISTANCE = /\b(ICE|IC|EC|FLX|ECE|RJ|NJ)\b/;

/**
 * bahn.de journey search between two stations, regional transport only (vm: 03 = regional trains, 04 = S-Bahn,
 * 05 = bus, 06 = ferry, 07 = U-Bahn, 08 = tram, 09 = on-demand). If bahn.de ignores the preset, the page tells the
 * visitor to tick "Nur Nahverkehr" / "Deutschland-Ticket".
 */
export const bahnUrl = (from: string, to: string) =>
  `https://www.bahn.de/buchung/fahrplan/suche#sts=true&so=${encodeURIComponent(from)}&zo=${encodeURIComponent(to)}&kl=2&vm=03,04,05,06,07,08,09`;

/** openstreetmap.org search for a place (no tiles are embedded on the page). */
export const osmSearchUrl = (query: string) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${query}, Deutschland`)}`;

/** "45–60 min" / "1 h 10 – 1 h 30" style label parts: hours and minutes of a duration. */
export const splitMinutes = (m: number) => ({ h: Math.floor(m / 60), m: m % 60 });

/** Every month a season covers (meteorological seasons: spring = Mar–May …). */
export const SEASON_MONTHS: Record<Season, number[]> = { spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11], winter: [12, 1, 2] };

/** Season of a month (1–12). */
export const seasonOf = (month: number): Season => (Object.keys(SEASON_MONTHS) as Season[]).find((s) => SEASON_MONTHS[s].includes(month)) ?? 'winter';

/** Trips sorted for display: those good in `season` first, then by shortest travel time. */
export const sortTrips = (trips: Trip[], season: Season | null) =>
  [...trips].sort((a, b) => {
    if (season) {
      const ga = a.seasons.includes(season) ? 0 : 1;
      const gb = b.seasons.includes(season) ? 0 : 1;
      if (ga !== gb) return ga - gb;
    }
    return a.minutes[0] - b.minutes[0] || a.minutes[1] - b.minutes[1];
  });

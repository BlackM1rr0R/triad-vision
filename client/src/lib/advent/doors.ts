/**
 * The 24 doors of the Advent calendar (/advent-calendar): German Christmas traditions, phrases (read aloud with the
 * browser's German voice), mini quizzes (3 options) and practical tips. Pure data in all six site languages.
 *
 * Facts checked 2026-11-17 (ADVENT_AS_OF):
 *  - shops close at 14:00 on 24 December when it is a weekday: § 3 Nr. 3 LadSchlG (state laws are similar),
 *    https://www.gesetze-im-internet.de/ladschlg/__3.html
 *  - fireworks (category F2) are sold to adults only 29–31 December and may be set off by them only on 31 December
 *    and 1 January: §§ 22, 23 1. SprengV, https://www.gesetze-im-internet.de/sprengv_1/__22.html, …/__23.html
 *  - lead-casting sets (Bleigießen) may no longer be sold since 2018 (EU REACH limit for lead): Stiftung Warentest,
 *    https://www.test.de/Bleigiessen-Besser-bleifrei-ins-Neue-Jahr-4484000-0/
 *  - no statutory right to a Christmas bonus (only contract, collective agreement, works agreement or repeated
 *    payment): DGB guide, https://www.dgb.de/fileadmin/dateien/Dokumente/Dateien_f%C3%BCr_Ratgeber_FAQ/Weihnachtsgeld_-_Informationen_und_Tipps_f%C3%BCr_Besch%C3%A4ftigte.pdf
 *  - 25/26 December and 1 January are public holidays in all states; 24 and 31 December are not.
 *  - 2026: 24 Dec = Thursday, 25 Dec = Friday, 26 Dec = Saturday, 27 Dec = Sunday (year-specific: door 22).
 */
import type { Tx, TxNoDe } from '@/lib/games/common';

export type DoorKind = 'tradition' | 'phrase' | 'quiz' | 'tip';

export interface Door {
  day: number;
  kind: DoorKind;
  title: Tx;
  text: Tx;
  /** Phrase doors: the German sentence (read aloud) and its translation. */
  phrase?: { de: string; tx: TxNoDe };
  /** Quiz doors: the question, three options and the right one (index). `text` explains the answer. */
  quiz?: { q: Tx; options: [Tx, Tx, Tx]; answer: number };
  /** A site page to go on with (title from the tools hub copy: toolsPage.items.<toolKey>.title). */
  link?: { to: string; toolKey?: string; glossary?: string };
  source?: { label: string; url: string };
}

const tx = (az: string, de: string, en: string, ru: string, tr: string, uk: string): Tx => ({ az, de, en, ru, tr, uk });
const nd = (az: string, en: string, ru: string, tr: string, uk: string): TxNoDe => ({ az, en, ru, tr, uk });

export const DOORS: readonly Door[] = [
  {
    day: 1,
    kind: 'tradition',
    title: tx('Advent təqvimi', 'Der Adventskalender', 'The Advent calendar', 'Адвент-календарь', 'Advent takvimi', 'Адвент-календар'),
    text: tx(
      'Almaniyada uşaqlar (və çox böyüklər də) 1-dən 24 dekabra qədər hər gün bir qapı açır — içində şokolad, kiçik hədiyyə və ya şəkil olur. Çap olunmuş ilk təqvimlər XX əsrin əvvəlində Almaniyada çıxıb. Bu təqvim də eynidir: hər gün bir qapı!',
      'Kinder (und viele Erwachsene) öffnen vom 1. bis 24. Dezember jeden Tag ein Türchen — dahinter Schokolade, ein kleines Geschenk oder ein Bild. Die ersten gedruckten Kalender erschienen Anfang des 20. Jahrhunderts in Deutschland. Dieser Kalender funktioniert genauso: jeden Tag ein Türchen!',
      'From 1 to 24 December children (and many adults) open one door a day — behind it a chocolate, a small gift or a picture. The first printed calendars appeared in Germany in the early 20th century. This one works the same way: one door a day!',
      'С 1 по 24 декабря дети (и многие взрослые) каждый день открывают одно окошко — за ним шоколадка, маленький подарок или картинка. Первые печатные календари появились в Германии в начале XX века. Этот календарь такой же: одно окошко в день!',
      'Çocuklar (ve birçok yetişkin) 1–24 Aralık arasında her gün bir kapı açar — arkasında çikolata, küçük bir hediye ya da resim olur. İlk basılı takvimler 20. yüzyılın başında Almanya’da çıktı. Bu takvim de öyle: her gün bir kapı!',
      'З 1 по 24 грудня діти (і багато дорослих) щодня відкривають одне віконце — за ним шоколадка, невеликий подарунок чи картинка. Перші друковані календарі з’явилися в Німеччині на початку XX століття. Цей календар такий самий: одне віконце на день!',
    ),
  },
  {
    day: 2,
    kind: 'phrase',
    title: tx('Gözəl Advent dövrü arzusu', 'Eine schöne Adventszeit', 'Wishing a nice Advent season', 'Пожелание на Адвент', 'Güzel bir Advent dileği', 'Побажання на Адвент'),
    phrase: { de: 'Ich wünsche Ihnen eine schöne Adventszeit!', tx: nd('Sizə gözəl Advent dövrü arzu edirəm!', 'I wish you a lovely Advent season!', 'Желаю вам прекрасного времени Адвента!', 'Size güzel bir Advent dönemi dilerim!', 'Бажаю вам чудового часу Адвенту!') },
    text: tx(
      'Dekabrda iş yoldaşlarına, qonşulara və ya mağazada belə deyilir. “Ihnen” — rəsmi (Sie); dostlara: “Ich wünsche dir eine schöne Adventszeit!”',
      'Sagt man im Dezember zu Kollegen, Nachbarn oder an der Kasse. „Ihnen“ ist die Sie-Form; unter Freunden: „Ich wünsche dir eine schöne Adventszeit!“',
      'Said in December to colleagues, neighbours or at the till. “Ihnen” is the formal “Sie”; to friends: “Ich wünsche dir eine schöne Adventszeit!”',
      'Так говорят в декабре коллегам, соседям или на кассе. «Ihnen» — вежливая форма (Sie); друзьям: «Ich wünsche dir eine schöne Adventszeit!»',
      'Aralıkta iş arkadaşlarına, komşulara ya da kasada söylenir. “Ihnen” resmi hitaptır (Sie); arkadaşlara: “Ich wünsche dir eine schöne Adventszeit!”',
      'Так кажуть у грудні колегам, сусідам або на касі. «Ihnen» — ввічлива форма (Sie); друзям: «Ich wünsche dir eine schöne Adventszeit!»',
    ),
  },
  {
    day: 3,
    kind: 'tradition',
    title: tx('Advent çələngi (Adventskranz)', 'Der Adventskranz', 'The Advent wreath', 'Адвентский венок', 'Advent çelengi', 'Адвентовий вінок'),
    text: tx(
      'Şam budaqlarından çələng və dörd şam: Miladdan əvvəlki dörd bazar gününün hər birində bir şam artıq yandırılır. İdeya XIX əsrdə Hamburqdan (Johann Hinrich Wichern) gəlir. Diqqət: quru budaqlar tez alışır — şamı nəzarətsiz qoymayın.',
      'Ein Kranz aus Tannengrün mit vier Kerzen: an jedem der vier Sonntage vor Weihnachten brennt eine Kerze mehr. Die Idee stammt aus dem 19. Jahrhundert aus Hamburg (Johann Hinrich Wichern). Vorsicht: trockene Zweige brennen schnell — Kerzen nie unbeaufsichtigt lassen.',
      'A wreath of fir twigs with four candles: on each of the four Sundays before Christmas one more candle is lit. The idea comes from 19th-century Hamburg (Johann Hinrich Wichern). Careful: dry twigs catch fire quickly — never leave candles burning alone.',
      'Венок из еловых веток с четырьмя свечами: в каждое из четырёх воскресений перед Рождеством зажигают на одну свечу больше. Идея родом из Гамбурга XIX века (Иоганн Хинрих Вихерн). Осторожно: сухие ветки быстро загораются — не оставляйте свечи без присмотра.',
      'Çam dallarından dört mumlu bir çelenk: Noel’den önceki dört pazarın her birinde bir mum daha yakılır. Fikir 19. yüzyılda Hamburg’dan (Johann Hinrich Wichern) gelir. Dikkat: kuru dallar çabuk tutuşur — mumları asla gözetimsiz bırakmayın.',
      'Вінок з ялинових гілок із чотирма свічками: у кожну з чотирьох неділь перед Різдвом запалюють на одну свічку більше. Ідея походить із Гамбурга XIX століття (Йоганн Гінріх Віхерн). Обережно: сухі гілки швидко спалахують — не залишайте свічки без нагляду.',
    ),
  },
  {
    day: 4,
    kind: 'quiz',
    title: tx('Viktorina: çəkmələr qapının ağzında', 'Quiz: Stiefel vor der Tür', 'Quiz: boots by the door', 'Викторина: сапоги у двери', 'Test: kapının önündeki botlar', 'Вікторина: чоботи біля дверей'),
    quiz: {
      q: tx(
        'Alman uşaqları təmizlənmiş çəkmələrini hansı gecə qapının ağzına qoyur ki, səhər içində şirniyyat olsun?',
        'In welcher Nacht stellen Kinder in Deutschland ihre geputzten Stiefel vor die Tür, damit morgens Süßigkeiten darin sind?',
        'On which night do children in Germany put their cleaned boots outside the door so that sweets are in them in the morning?',
        'В какую ночь дети в Германии выставляют за дверь начищенные сапоги, чтобы утром найти в них сладости?',
        'Almanya’da çocuklar temizlenmiş botlarını hangi gece kapının önüne koyar ki sabah içinde şeker olsun?',
        'Якої ночі діти в Німеччині виставляють за двері начищені чоботи, щоб уранці знайти в них солодощі?',
      ),
      options: [
        tx('30 noyabrdan 1 dekabra', '30. November auf 1. Dezember', '30 November to 1 December', 'С 30 ноября на 1 декабря', '30 Kasım’dan 1 Aralık’a', 'З 30 листопада на 1 грудня'),
        tx('5-dən 6 dekabra', '5. auf 6. Dezember', '5 to 6 December', 'С 5 на 6 декабря', '5’ten 6 Aralık’a', 'З 5 на 6 грудня'),
        tx('23-dən 24 dekabra', '23. auf 24. Dezember', '23 to 24 December', 'С 23 на 24 декабря', '23’ten 24 Aralık’a', 'З 23 на 24 грудня'),
      ],
      answer: 1,
    },
    text: tx(
      '6 dekabr — Nikolaus günüdür (Müqəddəs Nikolay). Axşam uşaqlar çəkmələrini təmizləyib qapının ağzına qoyur, səhər içində naringi, qoz-fındıq və şokolad olur.',
      'Der 6. Dezember ist Nikolaustag. Am Abend davor putzen Kinder ihre Stiefel und stellen sie vor die Tür; morgens stecken Mandarinen, Nüsse und Schokolade darin.',
      '6 December is St Nicholas’ Day (Nikolaustag). The evening before, children clean their boots and put them outside; in the morning they find tangerines, nuts and chocolate.',
      '6 декабря — День святого Николая (Nikolaustag). Вечером накануне дети чистят сапоги и ставят их за дверь, а утром находят в них мандарины, орехи и шоколад.',
      '6 Aralık Aziz Nikolaus Günü’dür (Nikolaustag). Önceki akşam çocuklar botlarını temizleyip kapının önüne koyar; sabah içinde mandalina, ceviz ve çikolata bulur.',
      '6 грудня — День святого Миколая (Nikolaustag). Увечері напередодні діти чистять чоботи й ставлять за двері, а вранці знаходять у них мандарини, горіхи й шоколад.',
    ),
  },
  {
    day: 5,
    kind: 'phrase',
    title: tx('Milad və Yeni il təbriki', 'Frohe Weihnachten und guten Rutsch', 'Christmas and New Year greeting', 'Поздравление с Рождеством и Новым годом', 'Noel ve yılbaşı tebriği', 'Привітання з Різдвом і Новим роком'),
    phrase: { de: 'Frohe Weihnachten und einen guten Rutsch ins neue Jahr!', tx: nd('Milad bayramınız mübarək və Yeni ilə yaxşı keçid!', 'Merry Christmas and a good slide into the new year!', 'Счастливого Рождества и хорошего «скольжения» в Новый год!', 'Mutlu Noeller ve yeni yıla iyi bir “kayış”!', 'Щасливого Різдва та гарного «ковзання» в Новий рік!') },
    text: tx(
      '“Guten Rutsch” hərfi mənada “yaxşı sürüşmə” deməkdir — Yeni ilə rahat keçid arzusu. Dekabrın son günlərində hər yerdə eşidəcəksiniz.',
      '„Guten Rutsch“ wünscht man ab Weihnachten bis Silvester: einen guten Übergang ins neue Jahr.',
      '“Guten Rutsch” literally means “good slide” — a wish for a smooth start to the new year. You will hear it everywhere in the last days of December.',
      '«Guten Rutsch» дословно — «хорошего скольжения», то есть лёгкого перехода в Новый год. В последние дни декабря это слышно повсюду.',
      '“Guten Rutsch” kelimesi kelimesine “iyi kayışlar” demektir — yeni yıla sorunsuz geçiş dileği. Aralık’ın son günlerinde her yerde duyarsınız.',
      '«Guten Rutsch» дослівно — «гарного ковзання», тобто легкого переходу в Новий рік. В останні дні грудня це чути всюди.',
    ),
  },
  {
    day: 6,
    kind: 'tradition',
    title: tx('Nikolaus günü', 'Nikolaustag', 'St Nicholas’ Day', 'День святого Николая', 'Aziz Nikolaus Günü', 'День святого Миколая'),
    text: tx(
      'Bu gün Nikolaus uzun ağ saqqal və yepiskop papağı ilə uşaq bağçalarına və məktəblərə gəlir, bəzən yanında Knecht Ruprecht olur. Bir çox iş yerində də şokolad Nikolaus paylanır. Bu, bayram (qeyri-iş) günü deyil.',
      'Heute besucht der Nikolaus mit langem weißem Bart und Bischofsmütze Kitas und Schulen, manchmal begleitet von Knecht Ruprecht. In vielen Betrieben gibt es Schoko-Nikoläuse. Ein Feiertag ist der Tag nicht.',
      'Today St Nicholas, with a long white beard and a bishop’s mitre, visits nurseries and schools, sometimes with his helper Knecht Ruprecht. Many workplaces hand out chocolate Santas. It is not a public holiday.',
      'Сегодня Николай с длинной белой бородой и епископской митрой приходит в детские сады и школы, иногда с помощником Кнехтом Рупрехтом. Во многих компаниях раздают шоколадных Николаев. Выходным этот день не является.',
      'Bugün uzun beyaz sakallı, piskopos şapkalı Nikolaus kreşleri ve okulları ziyaret eder, bazen yanında Knecht Ruprecht olur. Birçok iş yerinde çikolata Nikolaus dağıtılır. Resmi tatil değildir.',
      'Сьогодні Миколай з довгою білою бородою та єпископською митрою відвідує садочки й школи, іноді з помічником Кнехтом Рупрехтом. У багатьох компаніях роздають шоколадних Миколаїв. Вихідним цей день не є.',
    ),
  },
  {
    day: 7,
    kind: 'tip',
    title: tx('Weihnachtsgeld: qanunla məcburidirmi?', 'Weihnachtsgeld: Pflicht oder nicht?', 'Christmas bonus: required by law?', 'Weihnachtsgeld: обязан ли работодатель?', 'Noel ikramiyesi: yasal zorunluluk mu?', 'Weihnachtsgeld: чи зобов’язаний роботодавець?'),
    text: tx(
      'Almaniyada Milad pulu (Weihnachtsgeld) üçün qanuni hüquq yoxdur. O, yalnız əmək müqaviləsində, kollektiv müqavilədə (Tarifvertrag), müəssisə razılaşmasında və ya işəgötürən bunu ilbəil qeyd-şərtsiz ödəyibsə yaranır. Ödənilirsə, vergi və sosial sığorta tutulur — noyabr maaş vərəqənizə baxın.',
      'Einen gesetzlichen Anspruch auf Weihnachtsgeld gibt es nicht. Er entsteht nur aus Arbeitsvertrag, Tarifvertrag, Betriebsvereinbarung oder wenn der Arbeitgeber es wiederholt ohne Vorbehalt gezahlt hat (betriebliche Übung). Gezahlt wird es versteuert und mit Sozialabgaben — ein Blick auf die November-Abrechnung lohnt.',
      'There is no statutory right to a Christmas bonus in Germany. It only arises from your employment contract, a collective agreement, a works agreement or when the employer has paid it repeatedly without reservation. If paid, tax and social contributions are deducted — check your November payslip.',
      'Законного права на рождественские (Weihnachtsgeld) в Германии нет. Оно возникает только из трудового договора, тарифного соглашения, соглашения на предприятии или если работодатель платил его несколько лет подряд без оговорок. С выплаты удерживаются налог и соцвзносы — посмотрите ноябрьский расчётный лист.',
      'Almanya’da Noel ikramiyesi (Weihnachtsgeld) için yasal bir hak yoktur. Yalnızca iş sözleşmesi, toplu sözleşme (Tarifvertrag), işletme anlaşması ya da işverenin bunu çekincesiz olarak tekrar tekrar ödemesiyle doğar. Ödenirse vergi ve sosyal sigorta kesilir — kasım bordronuza bakın.',
      'Законного права на різдвяні (Weihnachtsgeld) у Німеччині немає. Воно виникає лише з трудового договору, тарифної угоди, угоди на підприємстві або якщо роботодавець платив їх кілька років поспіль без застережень. З виплати утримують податок і соцвнески — перегляньте листопадовий розрахунковий лист.',
    ),
    link: { to: '/payslip-explained', toolKey: 'payslip', glossary: 'weihnachtsgeld' },
    source: { label: 'DGB – Weihnachtsgeld: Informationen für Beschäftigte', url: 'https://www.dgb.de/fileadmin/dateien/Dokumente/Dateien_f%C3%BCr_Ratgeber_FAQ/Weihnachtsgeld_-_Informationen_und_Tipps_f%C3%BCr_Besch%C3%A4ftigte.pdf' },
  },
  {
    day: 8,
    kind: 'tradition',
    title: tx('Milad bazarı (Weihnachtsmarkt)', 'Der Weihnachtsmarkt', 'The Christmas market', 'Рождественская ярмарка', 'Noel pazarı', 'Різдвяний ярмарок'),
    text: tx(
      'Noyabrın sonundan Miladadək demək olar ki, hər şəhərdə taxta köşklər, işıqlar, qızardılmış badam, Bratwurst və Glühwein olur. Drezdenin Striezelmarkt-ı ən qədimlərdən sayılır (XV əsr). Axşam, iş saatlarından sonra iş yoldaşları ilə görüşmək üçün ən populyar yerdir.',
      'Von Ende November bis kurz vor Weihnachten gibt es fast in jeder Stadt Holzbuden, Lichter, gebrannte Mandeln, Bratwurst und Glühwein. Der Dresdner Striezelmarkt gilt als einer der ältesten (15. Jahrhundert). Abends trifft man sich dort gern mit Kollegen.',
      'From late November until just before Christmas almost every town has wooden stalls, lights, roasted almonds, bratwurst and mulled wine. Dresden’s Striezelmarkt is one of the oldest (15th century). In the evening it is the favourite place to meet colleagues.',
      'С конца ноября почти до Рождества почти в каждом городе стоят деревянные киоски, огни, жареный миндаль, братвурст и глинтвейн. Дрезденский Штрицельмаркт считается одним из старейших (XV век). Вечером там любят встречаться с коллегами.',
      'Kasım sonundan Noel’e kadar neredeyse her şehirde ahşap kulübeler, ışıklar, kavrulmuş badem, Bratwurst ve Glühwein olur. Dresden’in Striezelmarkt’ı en eskilerden sayılır (15. yüzyıl). Akşamları iş arkadaşlarıyla buluşmanın en sevilen yeridir.',
      'З кінця листопада майже до Різдва майже в кожному місті стоять дерев’яні кіоски, вогні, смажений мигдаль, братвурст і глінтвейн. Дрезденський Штріцельмаркт вважається одним із найстаріших (XV століття). Увечері там люблять зустрічатися з колегами.',
    ),
    link: { to: '/german-street', toolKey: 'germanStreet' },
  },
  {
    day: 9,
    kind: 'phrase',
    title: tx('Bazarda sifariş', 'Am Glühweinstand bestellen', 'Ordering at the stall', 'Заказ у киоска', 'Tezgâhta sipariş', 'Замовлення біля кіоску'),
    phrase: { de: 'Einen Glühwein und einen Kinderpunsch, bitte.', tx: nd('Bir Glühwein və bir uşaq punşu, zəhmət olmasa.', 'One mulled wine and one children’s punch, please.', 'Один глинтвейн и один детский пунш, пожалуйста.', 'Bir Glühwein ve bir çocuk punçu lütfen.', 'Один глінтвейн і один дитячий пунш, будь ласка.') },
    text: tx(
      'Sonra adətən soruşurlar: “Mit Schuss?” — yəni içkiyə əlavə rom və ya likör istəyirsinizmi. Spirtsiz istəyirsinizsə: “Ohne Alkohol, bitte.”',
      'Oft kommt die Rückfrage „Mit Schuss?“ — also mit einem Schuss Rum oder Likör. Wer keinen Alkohol möchte: „Ohne Alkohol, bitte.“',
      'You may be asked “Mit Schuss?” — with an extra shot of rum or liqueur. If you do not want alcohol: “Ohne Alkohol, bitte.”',
      'Часто переспрашивают: «Mit Schuss?» — то есть с добавкой рома или ликёра. Если не хотите алкоголя: «Ohne Alkohol, bitte.»',
      'Sıkça “Mit Schuss?” diye sorulur — yani içine bir shot rom ya da likör ister misiniz. Alkol istemiyorsanız: “Ohne Alkohol, bitte.”',
      'Часто перепитують: «Mit Schuss?» — тобто з додаванням рому чи лікеру. Якщо не хочете алкоголю: «Ohne Alkohol, bitte.»',
    ),
  },
  {
    day: 10,
    kind: 'quiz',
    title: tx('Viktorina: Kinderpunsch', 'Quiz: Kinderpunsch', 'Quiz: Kinderpunsch', 'Викторина: Kinderpunsch', 'Test: Kinderpunsch', 'Вікторина: Kinderpunsch'),
    quiz: {
      q: tx('Kinderpunsch nədir?', 'Was ist Kinderpunsch?', 'What is Kinderpunsch?', 'Что такое Kinderpunsch?', 'Kinderpunsch nedir?', 'Що таке Kinderpunsch?'),
      options: [
        tx('Az spirtli Glühwein', 'Glühwein mit weniger Alkohol', 'Mulled wine with less alcohol', 'Глинтвейн с меньшим количеством алкоголя', 'Daha az alkollü Glühwein', 'Глінтвейн із меншим вмістом алкоголю'),
        tx('İsti kakao', 'Heiße Schokolade', 'Hot chocolate', 'Горячий шоколад', 'Sıcak çikolata', 'Гарячий шоколад'),
        tx('Ədviyyatlı spirtsiz isti meyvə içkisi', 'Alkoholfreier heißer Früchtepunsch mit Gewürzen', 'An alcohol-free hot fruit punch with spices', 'Безалкогольный горячий фруктовый пунш со специями', 'Baharatlı alkolsüz sıcak meyve punçu', 'Безалкогольний гарячий фруктовий пунш зі спеціями'),
      ],
      answer: 2,
    },
    text: tx(
      'Kinderpunsch spirtsizdir: isti meyvə şirəsi, çay, darçın və mixək. Uşaqlar, sürücülər və spirt içməyənlər üçün idealdır.',
      'Kinderpunsch ist alkoholfrei: heißer Fruchtsaft, Tee, Zimt und Nelken — ideal für Kinder, Autofahrer und alle ohne Alkohol.',
      'Kinderpunsch is alcohol-free: hot fruit juice, tea, cinnamon and cloves — perfect for children, drivers and anyone who does not drink.',
      'Kinderpunsch без алкоголя: горячий фруктовый сок, чай, корица и гвоздика — для детей, водителей и всех, кто не пьёт.',
      'Kinderpunsch alkolsüzdür: sıcak meyve suyu, çay, tarçın ve karanfil — çocuklar, sürücüler ve alkol içmeyenler için ideal.',
      'Kinderpunsch без алкоголю: гарячий фруктовий сік, чай, кориця й гвоздика — для дітей, водіїв і всіх, хто не п’є.',
    ),
  },
  {
    day: 11,
    kind: 'tradition',
    title: tx('Stollen', 'Der Stollen', 'Stollen', 'Штоллен', 'Stollen', 'Штолен'),
    text: tx(
      'Kişmiş, sukat və badamla ağır Milad çörəyi, üstü pudra şəkərlə. Bir neçə həftə saxlanır və dadı yaxşılaşır. “Dresdner Christstollen” adı AB-də qorunur — yalnız Drezden bölgəsindən olan Stollen belə adlandırıla bilər.',
      'Schweres Weihnachtsgebäck mit Rosinen, Zitronat und Mandeln, dick mit Puderzucker. Es hält wochenlang und wird mit der Zeit besser. „Dresdner Christstollen“ ist EU-weit geschützt — nur Stollen aus der Region Dresden darf so heißen.',
      'A heavy Christmas bread with raisins, candied peel and almonds, thickly dusted with icing sugar. It keeps for weeks and gets better with time. “Dresdner Christstollen” is a protected EU name — only Stollen from the Dresden area may use it.',
      'Плотная рождественская выпечка с изюмом, цукатами и миндалём, обильно посыпанная сахарной пудрой. Хранится неделями и со временем становится вкуснее. Название «Dresdner Christstollen» защищено в ЕС — так может называться только штоллен из региона Дрездена.',
      'Kuru üzüm, şekerlenmiş kabuk ve bademli, üzeri bol pudra şekerli yoğun bir Noel ekmeği. Haftalarca dayanır ve zamanla daha lezzetli olur. “Dresdner Christstollen” AB’de korunan bir addır — yalnızca Dresden bölgesinden gelen Stollen bu adı taşıyabilir.',
      'Щільна різдвяна випічка з родзинками, цукатами й мигдалем, щедро посипана цукровою пудрою. Зберігається тижнями й з часом смачнішає. Назва «Dresdner Christstollen» захищена в ЄС — так може називатися лише штолен із регіону Дрездена.',
    ),
  },
  {
    day: 12,
    kind: 'tradition',
    title: tx('Plätzchen bişirmək', 'Plätzchen backen', 'Baking Christmas cookies', 'Печём рождественское печенье', 'Noel kurabiyesi pişirmek', 'Печемо різдвяне печиво'),
    text: tx(
      'Advent dövründə ailələr birlikdə peçenye bişirir: Vanillekipferl (vanilli aypara), Zimtsterne (darçınlı ulduzlar), Lebkuchen. İş yerinə bir qutu Plätzchen gətirmək — iş yoldaşları ilə tanış olmağın asan yoludur.',
      'In der Adventszeit backen Familien gemeinsam: Vanillekipferl, Zimtsterne, Lebkuchen. Eine Dose Plätzchen fürs Büro ist ein einfacher Weg, Kollegen besser kennenzulernen.',
      'During Advent families bake together: Vanillekipferl (vanilla crescents), Zimtsterne (cinnamon stars), Lebkuchen (gingerbread). Bringing a tin of Plätzchen to work is an easy way to get to know your colleagues.',
      'В Адвент семьи вместе пекут печенье: Vanillekipferl (ванильные рогалики), Zimtsterne (коричные звёзды), Lebkuchen (пряники). Коробка Plätzchen для коллег — простой способ познакомиться поближе.',
      'Advent döneminde aileler birlikte kurabiye pişirir: Vanillekipferl (vanilyalı ay çöreği), Zimtsterne (tarçınlı yıldızlar), Lebkuchen. İşe bir kutu Plätzchen götürmek iş arkadaşlarını tanımanın kolay yoludur.',
      'В Адвент родини разом печуть печиво: Vanillekipferl (ванільні ріжки), Zimtsterne (цинамонові зірочки), Lebkuchen (пряники). Коробка Plätzchen для колег — простий спосіб познайомитися ближче.',
    ),
  },
  {
    day: 13,
    kind: 'quiz',
    title: tx('Viktorina: fincan üçün əlavə pul', 'Quiz: Becher-Pfand', 'Quiz: the mug deposit', 'Викторина: залог за кружку', 'Test: kupa depozitosu', 'Вікторина: застава за кухоль'),
    quiz: {
      q: tx(
        'Milad bazarında Glühwein-i keramik fincanda alırsınız və bir neçə avro artıq ödəyirsiniz. Niyə?',
        'Auf dem Weihnachtsmarkt bekommen Sie den Glühwein in einer Keramiktasse und zahlen ein paar Euro mehr. Warum?',
        'At the Christmas market you get your mulled wine in a ceramic mug and pay a few euros more. Why?',
        'На рождественской ярмарке глинтвейн дают в керамической кружке и берут на пару евро больше. Почему?',
        'Noel pazarında Glühwein’i seramik bir kupada alırsınız ve birkaç euro fazla ödersiniz. Neden?',
        'На різдвяному ярмарку глінтвейн дають у керамічному кухлі й беруть на кілька євро більше. Чому?',
      ),
      options: [
        tx('Fincan üçün depozit (Pfand) — qaytaranda geri verilir', 'Pfand für die Tasse — gibt es bei Rückgabe zurück', 'A deposit (Pfand) for the mug — you get it back', 'Залог (Pfand) за кружку — вернут при возврате', 'Kupa için depozito (Pfand) — iade edince geri alırsınız', 'Застава (Pfand) за кухоль — повернуть, коли віддасте'),
        tx('Məcburi bəxşiş', 'Pflicht-Trinkgeld', 'A compulsory tip', 'Обязательные чаевые', 'Zorunlu bahşiş', 'Обов’язкові чайові'),
        tx('Xüsusi Milad vergisi', 'Eine Weihnachtssteuer', 'A special Christmas tax', 'Особый рождественский налог', 'Özel Noel vergisi', 'Особливий різдвяний податок'),
      ],
      answer: 0,
    },
    text: tx(
      'Bu, fincan üçün Pfand-dır (depozit). Fincanı köşkə qaytarsanız pulu geri alırsınız; xatirə kimi saxlaya da bilərsiniz. Məbləğ bazardan bazara dəyişir.',
      'Das ist Tassenpfand. Bringen Sie die Tasse zurück, gibt es das Geld wieder; Sie dürfen sie auch als Andenken behalten. Die Höhe ist je nach Markt verschieden.',
      'It is a mug deposit (Tassenpfand). Return the mug to a stall and you get the money back — or keep it as a souvenir. The amount varies from market to market.',
      'Это залог за кружку (Tassenpfand). Вернёте кружку в киоск — получите деньги обратно, или оставьте её на память. Сумма зависит от ярмарки.',
      'Bu kupa depozitosudur (Tassenpfand). Kupayı bir tezgâha iade ederseniz paranızı geri alırsınız — ya da hatıra olarak saklayın. Tutar pazara göre değişir.',
      'Це застава за кухоль (Tassenpfand). Повернете кухоль у кіоск — отримаєте гроші назад, або залиште його на згадку. Сума залежить від ярмарку.',
    ),
  },
  {
    day: 14,
    kind: 'tip',
    title: tx('Evə bağlama: erkən göndərin', 'Pakete in die Heimat: früh schicken', 'Parcels home: send early', 'Посылки домой: отправьте заранее', 'Memlekete koli: erken gönderin', 'Посилки додому: надішліть заздалегідь'),
    text: tx(
      'Azərbaycana beynəlxalq bağlamalar Miladdan əvvəl gömrük yoxlaması ilə birlikdə bir neçə həftə yolda ola bilər. Daşıyıcının (DHL, Deutsche Post və s.) dekabr son tarixlərini və qadağan olunmuş əşyalar siyahısını yoxlayın, gömrük bəyannaməsini doldurun. Pul köçürmələri üçün də bayramlarda bank günləri azdır.',
      'Internationale Pakete nach Aserbaidschan können vor Weihnachten samt Zoll mehrere Wochen unterwegs sein. Prüfen Sie die Dezember-Fristen und die Verbotslisten Ihres Versanddienstes (DHL, Deutsche Post usw.) und füllen Sie die Zollinhaltserklärung aus. Auch für Überweisungen gibt es an den Feiertagen weniger Bankarbeitstage.',
      'International parcels to Azerbaijan can take several weeks before Christmas, customs included. Check your carrier’s December deadlines and list of prohibited items (DHL, Deutsche Post etc.) and fill in the customs declaration. Money transfers also have fewer banking days over the holidays.',
      'Международные посылки в Азербайджан перед Рождеством вместе с таможней могут идти несколько недель. Проверьте декабрьские сроки и списки запрещённых вложений у перевозчика (DHL, Deutsche Post и т. д.) и заполните таможенную декларацию. Для денежных переводов в праздники тоже меньше банковских дней.',
      'Azerbaycan’a uluslararası koliler Noel öncesinde gümrükle birlikte birkaç hafta sürebilir. Kargo firmanızın (DHL, Deutsche Post vb.) aralık son tarihlerini ve yasaklı ürün listesini kontrol edin, gümrük beyannamesini doldurun. Para transferleri için de tatillerde daha az banka günü vardır.',
      'Міжнародні посилки до Азербайджану перед Різдвом разом із митницею можуть іти кілька тижнів. Перевірте грудневі терміни та списки заборонених вкладень у перевізника (DHL, Deutsche Post тощо) і заповніть митну декларацію. Для грошових переказів у свята теж менше банківських днів.',
    ),
    link: { to: '/send-money-home', toolKey: 'sendMoneyHome' },
  },
  {
    day: 15,
    kind: 'tradition',
    title: tx('Wichteln — gizli hədiyyə', 'Wichteln', 'Wichteln — Secret Santa', 'Wichteln — тайный Санта', 'Wichteln — gizli Noel Baba', 'Wichteln — таємний Санта'),
    text: tx(
      'İş yerində və ya dostlar arasında hər kəs püşklə bir nəfərin adını çəkir və ona anonim kiçik hədiyyə alır. Adətən məbləğ həddi razılaşdırılır (məs. 10–20 €). “Schrottwichteln” — evdəki lazımsız əşyalardan gülməli hədiyyə.',
      'Im Büro oder unter Freunden zieht jeder ein Los mit einem Namen und besorgt für diese Person anonym ein kleines Geschenk. Meist wird ein Betrag vereinbart (z. B. 10–20 €). Beim „Schrottwichteln“ verschenkt man lustigen Kram von zu Hause.',
      'At work or among friends everyone draws a name and buys that person a small anonymous gift. Usually a budget is agreed (e.g. 10–20 €). In “Schrottwichteln” you give away funny junk from home.',
      'На работе или среди друзей каждый тянет жребий с именем и анонимно дарит этому человеку небольшой подарок. Обычно договариваются о сумме (например, 10–20 €). «Schrottwichteln» — дарят забавный хлам из дома.',
      'İş yerinde ya da arkadaşlar arasında herkes kurayla bir isim çeker ve o kişiye isimsiz küçük bir hediye alır. Genellikle bir bütçe belirlenir (ör. 10–20 €). “Schrottwichteln”de evdeki komik ıvır zıvırlar hediye edilir.',
      'На роботі чи серед друзів кожен тягне жереб з ім’ям і анонімно дарує цій людині невеликий подарунок. Зазвичай домовляються про суму (наприклад, 10–20 €). «Schrottwichteln» — дарують кумедний мотлох із дому.',
    ),
  },
  {
    day: 16,
    kind: 'phrase',
    title: tx('Arzu soruşmaq', 'Nach dem Wunsch fragen', 'Asking about a wish', 'Спросить о желании', 'Dilek sormak', 'Запитати про бажання'),
    phrase: { de: 'Was wünschst du dir zu Weihnachten?', tx: nd('Milad üçün nə arzulayırsan?', 'What would you like for Christmas?', 'Что ты хочешь на Рождество?', 'Noel için ne istiyorsun?', 'Що ти хочеш на Різдво?') },
    text: tx(
      'Cavab: “Ich wünsche mir …” (Mən … istəyirəm). Uşaqlar arzularını “Wunschzettel”ə yazır — bir çox şəhərdə uşaqların məktubuna cavab verən “Weihnachtspostamt” (Milad poçtu) var.',
      'Antwort: „Ich wünsche mir …“. Kinder schreiben einen Wunschzettel — in mehreren Orten beantworten Weihnachtspostämter die Briefe der Kinder.',
      'Answer: “Ich wünsche mir …” (I would like …). Children write a wish list (Wunschzettel) — several German Christmas post offices answer children’s letters.',
      'Ответ: «Ich wünsche mir …» (Я хочу …). Дети пишут список желаний (Wunschzettel) — несколько рождественских почтовых отделений в Германии отвечают на детские письма.',
      'Cevap: “Ich wünsche mir …” (… istiyorum). Çocuklar dilek listesi (Wunschzettel) yazar — Almanya’da birkaç Noel postanesi çocukların mektuplarını yanıtlar.',
      'Відповідь: «Ich wünsche mir …» (Я хочу …). Діти пишуть список бажань (Wunschzettel) — кілька різдвяних поштових відділень у Німеччині відповідають на дитячі листи.',
    ),
  },
  {
    day: 17,
    kind: 'quiz',
    title: tx('Viktorina: “Wir wichteln dieses Jahr”', 'Quiz: „Wir wichteln dieses Jahr“', 'Quiz: “Wir wichteln dieses Jahr”', 'Викторина: «Wir wichteln dieses Jahr»', 'Test: “Wir wichteln dieses Jahr”', 'Вікторина: «Wir wichteln dieses Jahr»'),
    quiz: {
      q: tx(
        'Komanda rəhbəriniz deyir: “Wir wichteln dieses Jahr, Limit 15 Euro.” Bu nə deməkdir?',
        'Ihre Teamleiterin sagt: „Wir wichteln dieses Jahr, Limit 15 Euro.“ Was heißt das?',
        'Your team lead says: “Wir wichteln dieses Jahr, Limit 15 Euro.” What does it mean?',
        'Руководитель команды говорит: «Wir wichteln dieses Jahr, Limit 15 Euro.» Что это значит?',
        'Ekip lideriniz diyor ki: “Wir wichteln dieses Jahr, Limit 15 Euro.” Bu ne demek?',
        'Керівниця команди каже: «Wir wichteln dieses Jahr, Limit 15 Euro.» Що це означає?',
      ),
      options: [
        tx('Hər kəs 15 € Milad bonusu alır', 'Alle bekommen 15 € Weihnachtsbonus', 'Everyone gets a 15 € Christmas bonus', 'Все получат рождественский бонус 15 €', 'Herkes 15 € Noel ikramiyesi alır', 'Усі отримають різдвяний бонус 15 €'),
        tx('Püşklə bir iş yoldaşına 15 €-ya qədər gizli hədiyyə', 'Per Los ein anonymes Geschenk bis 15 € für eine Kollegin oder einen Kollegen', 'Each person draws a colleague and buys an anonymous gift up to 15 €', 'По жребию анонимный подарок коллеге до 15 €', 'Kurayla bir iş arkadaşına 15 €’ya kadar isimsiz hediye', 'За жеребом анонімний подарунок колезі до 15 €'),
        tx('Korporativ şam yeməyi adambaşı 15 €', 'Die Weihnachtsfeier kostet 15 € pro Person', 'The office party costs 15 € per person', 'Корпоратив стоит 15 € с человека', 'Ofis partisi kişi başı 15 €', 'Корпоратив коштує 15 € з людини'),
      ],
      answer: 1,
    },
    text: tx(
      'Wichteln — gizli hədiyyə mübadiləsidir (Secret Santa). Kimə hədiyyə aldığınızı demirsiniz; hədiyyələr adətən Weihnachtsfeier-də (iş yerinin Milad şənliyi) açılır.',
      'Wichteln ist ein anonymer Geschenketausch. Wen man gezogen hat, verrät man nicht; ausgepackt wird meist auf der Weihnachtsfeier.',
      'Wichteln is an anonymous gift exchange. You do not tell whom you drew; gifts are usually opened at the office Christmas party (Weihnachtsfeier).',
      'Wichteln — анонимный обмен подарками. Кого вы вытянули, не говорят; подарки обычно открывают на корпоративе (Weihnachtsfeier).',
      'Wichteln isimsiz bir hediye değişimidir. Kimi çektiğinizi söylemezsiniz; hediyeler genellikle iş yerinin Noel partisinde (Weihnachtsfeier) açılır.',
      'Wichteln — анонімний обмін подарунками. Кого витягли, не кажуть; подарунки зазвичай відкривають на корпоративі (Weihnachtsfeier).',
    ),
  },
  {
    day: 18,
    kind: 'tradition',
    title: tx('Milad ağacı (Christbaum)', 'Der Christbaum', 'The Christmas tree', 'Рождественская ёлка', 'Noel ağacı', 'Різдвяна ялинка'),
    text: tx(
      'Canlı küknar və ya şam ağacı adətən Miladdan 1–2 həftə əvvəl alınır, çox ailədə yalnız 24 dekabrda bəzədilir. Yanvarda şəhərlər ağacları xüsusi günlərdə toplayır (Christbaumabholung) — öz şəhərinizin tullantı təqvimini yoxlayın, ağacı adi zibil qutusuna atmayın.',
      'Die echte Tanne oder Fichte kauft man meist ein bis zwei Wochen vor dem Fest, geschmückt wird in vielen Familien erst am 24. Dezember. Im Januar holen die Städte die Bäume an festen Tagen ab (Christbaumabholung) — Termine im Abfallkalender Ihrer Stadt.',
      'A real fir or spruce is usually bought one or two weeks before Christmas; many families decorate it only on 24 December. In January towns collect the trees on set days (Christbaumabholung) — check your town’s waste calendar instead of using the bin.',
      'Живую пихту или ель обычно покупают за одну-две недели до праздника, во многих семьях наряжают только 24 декабря. В январе города вывозят ёлки в определённые дни (Christbaumabholung) — смотрите календарь вывоза мусора своего города.',
      'Gerçek köknar ya da ladin genellikle bayramdan bir iki hafta önce alınır; birçok aile onu ancak 24 Aralık’ta süsler. Ocak ayında belediyeler ağaçları belirli günlerde toplar (Christbaumabholung) — çöp kutusuna atmak yerine şehrinizin atık takvimine bakın.',
      'Живу ялицю чи ялину зазвичай купують за один-два тижні до свята, у багатьох родинах прикрашають лише 24 грудня. У січні міста вивозять ялинки у визначені дні (Christbaumabholung) — дивіться календар вивезення сміття свого міста.',
    ),
    link: { to: '/waste-sorting', toolKey: 'wasteSorting' },
  },
  {
    day: 19,
    kind: 'tradition',
    title: tx('Krippe və Erzgebirge bəzəkləri', 'Krippe und Erzgebirge', 'Nativity scene and Erzgebirge decorations', 'Вертеп и украшения Рудных гор', 'Doğuş sahnesi ve Erzgebirge süsleri', 'Вертеп і прикраси Рудних гір'),
    text: tx(
      'Çox kilsədə və evdə İsanın doğuşunu göstərən fiqurlar (Krippe) qoyulur. Saksoniyanın Erzgebirge bölgəsindən gələn taxta bəzəklər məşhurdur: Schwibbogen (şamlı tağ, pəncərədə), Räuchermännchen (tüstülənən fiqur) və Nussknacker.',
      'In vielen Kirchen und Wohnungen steht eine Krippe mit der Geburt Jesu. Berühmt ist der Holzschmuck aus dem sächsischen Erzgebirge: Schwibbogen im Fenster, Räuchermännchen und Nussknacker.',
      'Many churches and homes set up a nativity scene (Krippe). Wooden decorations from the Erzgebirge in Saxony are famous: the candle arch (Schwibbogen) in the window, incense smokers (Räuchermännchen) and nutcrackers.',
      'Во многих церквях и домах ставят вертеп (Krippe) с рождением Иисуса. Знамениты деревянные украшения из саксонских Рудных гор (Erzgebirge): светящаяся арка Schwibbogen в окне, курительные человечки Räuchermännchen и щелкунчики.',
      'Birçok kilisede ve evde İsa’nın doğuşunu gösteren bir sahne (Krippe) kurulur. Saksonya’daki Erzgebirge’den gelen ahşap süsler ünlüdür: penceredeki mumlu kemer (Schwibbogen), tütsü adamlar (Räuchermännchen) ve fındıkkıranlar.',
      'У багатьох церквах і домівках ставлять вертеп (Krippe) з народженням Ісуса. Славляться дерев’яні прикраси із саксонських Рудних гір (Erzgebirge): світна арка Schwibbogen у вікні, курильні чоловічки Räuchermännchen і лускунчики.',
    ),
  },
  {
    day: 20,
    kind: 'tip',
    title: tx('Bayramlar: 24 və 31 dekabr iş günüdür', 'Feiertage: 24. und 31. sind Werktage', 'Holidays: 24 and 31 December are working days', 'Праздники: 24 и 31 декабря — рабочие дни', 'Tatiller: 24 ve 31 Aralık iş günüdür', 'Свята: 24 і 31 грудня — робочі дні'),
    text: tx(
      '25 və 26 dekabr, 1 yanvar bütün əyalətlərdə rəsmi bayramdır. 24 dekabr (Heiligabend) və 31 dekabr (Silvester) isə qanuni bayram deyil — bir çox işəgötürən yarım və ya tam gün istirahət verir, amma bu müqaviləyə bağlıdır. Körpü günləri ilə az məzuniyyətlə çox istirahət planlayın.',
      'Der 25. und 26. Dezember und der 1. Januar sind in allen Ländern gesetzliche Feiertage. Heiligabend und Silvester sind es nicht — viele Arbeitgeber geben einen halben oder ganzen Tag frei, das hängt aber vom Vertrag ab. Mit Brückentagen holen Sie aus wenig Urlaub viel freie Zeit heraus.',
      '25 and 26 December and 1 January are public holidays in every state. Christmas Eve (24 Dec) and New Year’s Eve (31 Dec) are not — many employers give a half or full day off, but that depends on your contract. Use bridge days to get a lot of time off for few vacation days.',
      '25 и 26 декабря и 1 января — официальные праздники во всех землях. Сочельник (24.12) и канун Нового года (31.12) — нет: многие работодатели дают полдня или день отдыха, но это зависит от договора. С помощью «мостиков» можно отдохнуть дольше за меньшее число дней отпуска.',
      '25 ve 26 Aralık ile 1 Ocak tüm eyaletlerde resmi tatildir. Noel arifesi (24 Aralık) ve yılbaşı gecesi (31 Aralık) değildir — birçok işveren yarım ya da tam gün izin verir, ama bu sözleşmeye bağlıdır. Köprü günleriyle az izinle uzun tatil yapın.',
      '25 і 26 грудня та 1 січня — офіційні свята в усіх землях. Святвечір (24.12) і переддень Нового року (31.12) — ні: багато роботодавців дають пів дня або день відпочинку, але це залежить від договору. Завдяки «місткам» можна відпочити довше за менше днів відпустки.',
    ),
    link: { to: '/holiday-planner', toolKey: 'holidayPlanner' },
  },
  {
    day: 21,
    kind: 'quiz',
    title: tx('Viktorina: 24 dekabrda mağazalar', 'Quiz: Läden am 24. Dezember', 'Quiz: shops on 24 December', 'Викторина: магазины 24 декабря', 'Test: 24 Aralık’ta mağazalar', 'Вікторина: магазини 24 грудня'),
    quiz: {
      q: tx(
        '24 dekabr iş gününə düşürsə, Almaniyada mağazalar ən gec nə vaxt bağlanır?',
        'Wann müssen Geschäfte am 24. Dezember, wenn er auf einen Werktag fällt, spätestens schließen?',
        'When do shops in Germany have to close at the latest on 24 December if it falls on a weekday?',
        'Во сколько самое позднее закрываются магазины в Германии 24 декабря, если это будний день?',
        '24 Aralık hafta içine denk gelirse Almanya’da mağazalar en geç ne zaman kapanır?',
        'О котрій найпізніше зачиняються магазини в Німеччині 24 грудня, якщо це будній день?',
      ),
      options: [
        tx('Saat 14:00-da', 'Um 14 Uhr', 'At 2 pm', 'В 14:00', 'Saat 14:00’te', 'О 14:00'),
        tx('Saat 18:00-da', 'Um 18 Uhr', 'At 6 pm', 'В 18:00', 'Saat 18:00’de', 'О 18:00'),
        tx('Bütün gün bağlıdır', 'Sie sind den ganzen Tag zu', 'They are closed all day', 'Закрыты весь день', 'Bütün gün kapalıdır', 'Зачинені весь день'),
      ],
      answer: 0,
    },
    text: tx(
      'Ladenschlussgesetz (§ 3) və əksər əyalət qanunlarına görə 24 dekabrda mağazalar ən gec 14:00-da bağlanır. Sonra 25 və 26 dekabr bayramdır — alış-verişi əvvəlcədən edin.',
      'Nach § 3 Ladenschlussgesetz und den meisten Landesgesetzen schließen die Läden am 24. Dezember spätestens um 14 Uhr. Danach folgen zwei Feiertage — rechtzeitig einkaufen!',
      'Under § 3 of the Shop Closing Act and most state laws, shops close at 2 pm at the latest on 24 December. Two public holidays follow — do your shopping early.',
      'По § 3 закона о часах работы магазинов (Ladenschlussgesetz) и большинству земельных законов 24 декабря магазины закрываются не позже 14:00. Потом два праздничных дня — закупитесь заранее.',
      'Dükkân Kapanış Yasası § 3 ve çoğu eyalet yasasına göre 24 Aralık’ta mağazalar en geç 14:00’te kapanır. Ardından iki resmi tatil gelir — alışverişinizi erken yapın.',
      'За § 3 закону про години роботи магазинів (Ladenschlussgesetz) і більшістю земельних законів 24 грудня магазини зачиняються не пізніше 14:00. Потім два святкові дні — закупіться заздалегідь.',
    ),
    source: { label: '§ 3 Ladenschlussgesetz', url: 'https://www.gesetze-im-internet.de/ladschlg/__3.html' },
  },
  {
    day: 22,
    kind: 'tip',
    title: tx('2026: üç gün mağazasız', '2026: drei Tage ohne Einkauf', '2026: three days without shops', '2026: три дня без магазинов', '2026: üç gün mağazasız', '2026: три дні без магазинів'),
    text: tx(
      '2026-da 24 dekabr cümə axşamıdır (mağazalar 14:00-dək), 25 dekabr cümə, 26 dekabr şənbə (hər ikisi bayram), sonra bazar günü gəlir — üç gün ardıcıl mağazalar bağlıdır. Ərzağı 24-ü səhərə qədər alın. Vağzal və hava limanı mağazaları və bəzi yanacaqdoldurma məntəqələri açıq ola bilər, amma bahadır. 31 dekabrda (cümə axşamı) bir çox mağaza erkən bağlanır, 1 yanvar (cümə) bayramdır.',
      '2026 ist der 24. Dezember ein Donnerstag (Läden bis 14 Uhr), der 25. ein Freitag, der 26. ein Samstag (beides Feiertage), dann kommt der Sonntag — drei Tage am Stück ist alles zu. Lebensmittel also bis zum 24. mittags einkaufen. Läden in Bahnhöfen, Flughäfen und manche Tankstellen haben offen, sind aber teurer. An Silvester (Donnerstag) schließen viele Läden früher, der 1. Januar (Freitag) ist Feiertag.',
      'In 2026, 24 December is a Thursday (shops until 2 pm), 25 December a Friday and 26 December a Saturday (both public holidays), followed by Sunday — shops are closed three days in a row. Buy food by midday on the 24th. Shops in stations and airports and some petrol stations stay open but cost more. On New Year’s Eve (Thursday) many shops close early; 1 January (Friday) is a public holiday.',
      'В 2026 году 24 декабря — четверг (магазины до 14:00), 25-е — пятница, 26-е — суббота (оба праздники), затем воскресенье: три дня подряд всё закрыто. Купите продукты до полудня 24-го. Магазины на вокзалах, в аэропортах и некоторые АЗС работают, но дороже. 31 декабря (четверг) многие магазины закрываются раньше, 1 января (пятница) — праздник.',
      '2026’da 24 Aralık perşembeye denk geliyor (mağazalar 14:00’e kadar), 25 Aralık cuma ve 26 Aralık cumartesi (ikisi de tatil), ardından pazar — üç gün üst üste her yer kapalı. Yiyecekleri 24’ü öğlene kadar alın. Gar, havalimanı mağazaları ve bazı benzin istasyonları açıktır ama daha pahalıdır. Yılbaşı gecesi (perşembe) birçok mağaza erken kapanır; 1 Ocak (cuma) tatildir.',
      'У 2026 році 24 грудня — четвер (магазини до 14:00), 25-те — п’ятниця, 26-те — субота (обидва свята), далі неділя: три дні поспіль усе зачинено. Купіть продукти до полудня 24-го. Магазини на вокзалах, в аеропортах і деякі АЗС працюють, але дорожче. 31 грудня (четвер) багато магазинів зачиняються раніше, 1 січня (п’ятниця) — свято.',
    ),
    link: { to: '/supermarket-game', toolKey: 'supermarketGame' },
  },
  {
    day: 23,
    kind: 'quiz',
    title: tx('Viktorina: Silvester fişəngləri', 'Quiz: Feuerwerk an Silvester', 'Quiz: New Year fireworks', 'Викторина: фейерверк на Новый год', 'Test: Yılbaşı havai fişekleri', 'Вікторина: феєрверк на Новий рік'),
    quiz: {
      q: tx(
        'Böyüklər adi fişəngləri (F2 kateqoriyası) nə vaxt atə bilər?',
        'Wann dürfen Erwachsene normales Silvesterfeuerwerk (Kategorie F2) abbrennen?',
        'When may adults set off ordinary New Year fireworks (category F2)?',
        'Когда взрослым можно запускать обычные фейерверки (категория F2)?',
        'Yetişkinler sıradan havai fişekleri (F2 kategorisi) ne zaman atabilir?',
        'Коли дорослим можна запускати звичайні феєрверки (категорія F2)?',
      ),
      options: [
        tx('Bütün dekabr boyu', 'Den ganzen Dezember', 'All of December', 'Весь декабрь', 'Bütün Aralık boyunca', 'Увесь грудень'),
        tx('İstənilən həftəsonu', 'An jedem Wochenende', 'Any weekend', 'В любые выходные', 'Herhangi bir hafta sonu', 'У будь-які вихідні'),
        tx('Yalnız 31 dekabr və 1 yanvarda', 'Nur am 31. Dezember und 1. Januar', 'Only on 31 December and 1 January', 'Только 31 декабря и 1 января', 'Yalnızca 31 Aralık ve 1 Ocak’ta', 'Лише 31 грудня та 1 січня'),
      ],
      answer: 2,
    },
    text: tx(
      'Fişənglər yalnız 29–31 dekabrda 18 yaşdan yuxarılara satılır və yalnız 31 dekabr – 1 yanvarda atıla bilər; kilsə, xəstəxana və qocalar evinin yanında qadağandır, bir çox şəhərdə qadağan zonaları var. Silvester ənənələri: televiziyada hər il “Dinner for One”, qurğuşun tökmə (Bleigießen) əvəzinə mum tökmə — qurğuşunlu dəstlərin satışı 2018-dən qadağandır.',
      'Verkauft wird nur vom 29. bis 31. Dezember an Volljährige, abgebrannt werden darf nur am 31. Dezember und 1. Januar; nicht in der Nähe von Kirchen, Krankenhäusern und Altenheimen, viele Städte haben Verbotszonen. Silvester-Bräuche: „Dinner for One“ im Fernsehen und Wachsgießen statt Bleigießen — bleihaltige Sets dürfen seit 2018 nicht mehr verkauft werden.',
      'Fireworks are sold to adults only from 29 to 31 December and may only be set off on 31 December and 1 January — never near churches, hospitals or care homes, and many cities have no-firework zones. New Year’s Eve traditions: “Dinner for One” on TV every year, and wax pouring instead of lead pouring (Bleigießen) — lead sets may no longer be sold since 2018.',
      'Фейерверки продают совершеннолетним только с 29 по 31 декабря, запускать можно только 31 декабря и 1 января — не рядом с церквями, больницами и домами престарелых; во многих городах есть запретные зоны. Новогодние традиции: «Dinner for One» по ТВ каждый год и литьё воска вместо литья свинца (Bleigießen) — свинцовые наборы с 2018 года продавать нельзя.',
      'Havai fişekler yalnızca 29–31 Aralık arasında yetişkinlere satılır ve yalnızca 31 Aralık ile 1 Ocak’ta atılabilir — kilise, hastane ve huzurevlerinin yakınında asla; birçok şehirde yasak bölgeler var. Yılbaşı gelenekleri: her yıl televizyonda “Dinner for One” ve kurşun dökme (Bleigießen) yerine mum dökme — kurşunlu setlerin satışı 2018’den beri yasak.',
      'Феєрверки продають повнолітнім лише з 29 по 31 грудня, запускати можна лише 31 грудня та 1 січня — не поблизу церков, лікарень і будинків для літніх людей; у багатьох містах є заборонені зони. Новорічні традиції: «Dinner for One» на ТБ щороку й лиття воску замість лиття свинцю (Bleigießen) — свинцеві набори з 2018 року продавати не можна.',
    ),
    source: { label: '1. SprengV §§ 22, 23', url: 'https://www.gesetze-im-internet.de/sprengv_1/__23.html' },
  },
  {
    day: 24,
    kind: 'tradition',
    title: tx('Heiligabend — Milad gecəsi', 'Heiligabend', 'Christmas Eve', 'Сочельник', 'Noel arifesi', 'Святвечір'),
    text: tx(
      'Almaniyada əsas hədiyyə vaxtı 24 dekabrın axşamıdır (Bescherung): cənubda hədiyyələri “Christkind”, şimalda “Weihnachtsmann” gətirir. Çox ailədə sadə yemək olur — kartof salatı və sosiska — və ya kilsəyə gedirlər. 25 və 26 dekabr ailə ilə keçirilən sakit bayram günləridir. Frohe Weihnachten!',
      'Die Bescherung ist am Abend des 24. Dezember: im Süden bringt das Christkind die Geschenke, im Norden der Weihnachtsmann. In vielen Familien gibt es Kartoffelsalat mit Würstchen oder man geht in die Christmette. Der 25. und 26. sind ruhige Familientage. Frohe Weihnachten!',
      'In Germany the main gift-giving is on the evening of 24 December (Bescherung): in the south the Christkind brings the presents, in the north the Weihnachtsmann. Many families eat simple potato salad with sausages or go to church. 25 and 26 December are quiet family days. Frohe Weihnachten!',
      'Главное вручение подарков в Германии — вечером 24 декабря (Bescherung): на юге подарки приносит Christkind, на севере — Weihnachtsmann. Во многих семьях едят простой картофельный салат с сосисками или идут в церковь. 25 и 26 декабря — тихие семейные дни. Frohe Weihnachten!',
      'Almanya’da asıl hediye zamanı 24 Aralık akşamıdır (Bescherung): güneyde hediyeleri Christkind, kuzeyde Weihnachtsmann getirir. Birçok ailede sade bir yemek — patates salatası ve sosis — yenir ya da kiliseye gidilir. 25 ve 26 Aralık sakin aile günleridir. Frohe Weihnachten!',
      'Головне вручення подарунків у Німеччині — увечері 24 грудня (Bescherung): на півдні подарунки приносить Christkind, на півночі — Weihnachtsmann. У багатьох родинах їдять простий картопляний салат із сосисками або йдуть до церкви. 25 і 26 грудня — тихі родинні дні. Frohe Weihnachten!',
    ),
  },
];

export const doorOf = (day: number) => DOORS.find((d) => d.day === day) ?? null;
export const QUIZ_DAYS = DOORS.filter((d) => d.kind === 'quiz').map((d) => d.day);

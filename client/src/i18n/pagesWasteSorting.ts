/**
 * Waste sorting game (/waste-sorting): UI copy in all six site languages (keys wasteSorting.*). The items and
 * bins with their explanations live in lib/games/waste/items.ts. Shared game chrome: pagesGames (games.common.*).
 */
const az = {
  wasteSorting: {
    heroTitle: 'Zibili çeşidlə: Almaniyada Mülltrennung',
    heroSubtitle: 'Sarı kisə, kağız, bio, qalıq, şüşə, Pfand və ya Wertstoffhof? 20 əşyanı vaxtında düzgün qaba atın — hər cavabdan sonra izah.',
    intro: {
      title: 'Necə oynanır',
      text: '{{n}} əşya, {{sec}} saniyə. Düzgün cavablar ardıcıl gəldikcə kombo vurğunu artır (×3-ə qədər), sürətli cavab əlavə xal verir. İzahı oxuyarkən vaxt dayanır.',
      controls: 'Qaba toxunun, əşyanı qaba sürükləyin və ya klaviaturada 1–7 rəqəmlərini basın. Enter — növbəti.',
      start: 'Oyuna başla',
      shared: 'Sizinlə paylaşılan raund: eyni əşyalar.',
    },
    hud: { items: 'Əşya {{n}} / {{total}}', combo: 'Kombo ×{{m}}', streak: '{{n}} ardıcıl' },
    play: {
      prompt: 'Bu hara atılır?',
      drag: 'Sürükləyin və ya qaba toxunun',
      bins: 'Qablar',
      tricky: 'Çətin',
    },
    feedback: {
      right: 'Düzdür! +{{points}}',
      wrongBin: 'Səhv. Düzgün yer: {{bin}}',
      glass: 'Konteyner: {{colour}}',
    },
    glass: { weiss: 'ağ', gruen: 'yaşıl', braun: 'qəhvəyi' },
    end: {
      title: 'Nəticə',
      timeUp: 'Vaxt bitdi!',
      allDone: 'Bütün əşyalar çeşidləndi!',
      points: '{{n}} xal',
      stats: '{{correct}} / {{answered}} düz · dəqiqlik {{accuracy}} % · maks. kombo {{combo}}',
      bonus: 'Vaxt bonusu: +{{n}}',
      newBest: 'Yeni rekord!',
      mistakes: 'Səhvlərinizə baxın',
      noMistakes: 'Heç bir səhv yoxdur — əla!',
      yours: 'Sizin cavab: {{bin}}',
      again: 'Yeni raund',
      cardLead: 'Almaniyada zibil çeşidləmə oyunu',
      cardSub: '{{correct}} / {{answered}} düz · maks. kombo {{combo}}',
    },
    learn: {
      title: 'Hansı qaba nə atılır: bütün əşyalar',
      text: 'Qaba görə qruplaşdırılmış {{n}} əşya və izahları. Çətin olanlar işarələnib.',
    },
    note: {
      title: 'Vacib: qaydalar icmaya görə dəyişir',
      text: 'Almaniyada tullantı qaydalarını hər icma (Kommune) özü müəyyən edir. Burada ölkə üzrə ümumi tövsiyələr verilib. Yaşadığınız yerin Abfallkalender-inə (zibil təqvimi) və ya icmanın Abfallberatung xidmətinə baxın.',
      pfand: 'Pfand: birdəfəlik plastik butulka və bankalar 25 sent, çoxdəfəlik şüşələr adətən 8–15 sent.',
      sources: 'Mənbələr',
    },
  },
};

const de: typeof az = {
  wasteSorting: {
    heroTitle: 'Mülltrennung: das Sortierspiel',
    heroSubtitle: 'Gelber Sack, Papier, Bio, Restmüll, Glas, Pfand oder Wertstoffhof? Sortieren Sie 20 Dinge gegen die Zeit – mit Erklärung nach jeder Antwort.',
    intro: {
      title: 'So geht’s',
      text: '{{n}} Dinge, {{sec}} Sekunden. Richtige Antworten in Folge erhöhen den Combo-Multiplikator (bis ×3), schnelle Antworten geben Bonuspunkte. Während die Erklärung angezeigt wird, steht die Uhr.',
      controls: 'Tonne antippen, Gegenstand auf die Tonne ziehen oder Tasten 1–7 drücken. Enter – weiter.',
      start: 'Spiel starten',
      shared: 'Geteilte Runde: dieselben Gegenstände.',
    },
    hud: { items: 'Ding {{n}} / {{total}}', combo: 'Combo ×{{m}}', streak: '{{n}} in Folge' },
    play: {
      prompt: 'Wohin damit?',
      drag: 'Ziehen oder Tonne antippen',
      bins: 'Tonnen',
      tricky: 'Knifflig',
    },
    feedback: {
      right: 'Richtig! +{{points}}',
      wrongBin: 'Falsch. Richtig wäre: {{bin}}',
      glass: 'Container: {{colour}}',
    },
    glass: { weiss: 'weiß', gruen: 'grün', braun: 'braun' },
    end: {
      title: 'Ergebnis',
      timeUp: 'Die Zeit ist um!',
      allDone: 'Alles sortiert!',
      points: '{{n}} Punkte',
      stats: '{{correct}} / {{answered}} richtig · Trefferquote {{accuracy}} % · max. Combo {{combo}}',
      bonus: 'Zeitbonus: +{{n}}',
      newBest: 'Neuer Bestwert!',
      mistakes: 'Ihre Fehler im Rückblick',
      noMistakes: 'Kein einziger Fehler – super!',
      yours: 'Ihre Antwort: {{bin}}',
      again: 'Neue Runde',
      cardLead: 'Mülltrennung in Deutschland – das Spiel',
      cardSub: '{{correct}} / {{answered}} richtig · max. Combo {{combo}}',
    },
    learn: {
      title: 'Was gehört wohin: alle Gegenstände',
      text: '{{n}} Gegenstände nach Tonne sortiert, mit Erklärung. Knifflige Fälle sind markiert.',
    },
    note: {
      title: 'Wichtig: Jede Kommune regelt das selbst',
      text: 'Die Abfallregeln legt in Deutschland jede Kommune fest. Hier stehen die bundesweit üblichen Empfehlungen. Maßgeblich sind Ihr örtlicher Abfallkalender und die Abfallberatung Ihrer Stadt oder Ihres Landkreises.',
      pfand: 'Pfand: Einweg-Plastikflaschen und Dosen 25 Cent, Mehrwegflaschen meist 8–15 Cent.',
      sources: 'Quellen',
    },
  },
};

const en: typeof az = {
  wasteSorting: {
    heroTitle: 'Waste sorting game: Mülltrennung in Germany',
    heroSubtitle: 'Yellow bag, paper, organic, general waste, glass, deposit or recycling centre? Sort 20 items against the clock — with an explanation after every answer.',
    intro: {
      title: 'How to play',
      text: '{{n}} items, {{sec}} seconds. Correct answers in a row raise the combo multiplier (up to ×3), fast answers earn bonus points. The clock stops while the explanation is shown.',
      controls: 'Tap a bin, drag the item onto a bin or press keys 1–7. Enter — next.',
      start: 'Start the game',
      shared: 'Shared round: the same items.',
    },
    hud: { items: 'Item {{n}} / {{total}}', combo: 'Combo ×{{m}}', streak: '{{n}} in a row' },
    play: {
      prompt: 'Where does it go?',
      drag: 'Drag or tap a bin',
      bins: 'Bins',
      tricky: 'Tricky',
    },
    feedback: {
      right: 'Correct! +{{points}}',
      wrongBin: 'Wrong. It goes to: {{bin}}',
      glass: 'Container: {{colour}}',
    },
    glass: { weiss: 'white', gruen: 'green', braun: 'brown' },
    end: {
      title: 'Result',
      timeUp: 'Time is up!',
      allDone: 'Everything sorted!',
      points: '{{n}} points',
      stats: '{{correct}} / {{answered}} correct · accuracy {{accuracy}} % · max combo {{combo}}',
      bonus: 'Time bonus: +{{n}}',
      newBest: 'New best score!',
      mistakes: 'Review your mistakes',
      noMistakes: 'Not a single mistake — great!',
      yours: 'Your answer: {{bin}}',
      again: 'New round',
      cardLead: 'Waste sorting in Germany — the game',
      cardSub: '{{correct}} / {{answered}} correct · max combo {{combo}}',
    },
    learn: {
      title: 'What goes where: all items',
      text: '{{n}} items grouped by bin, with explanations. Tricky cases are marked.',
    },
    note: {
      title: 'Important: every municipality sets its own rules',
      text: 'In Germany each municipality (Kommune) decides its waste rules. This game follows the common nationwide recommendations. What counts is your local Abfallkalender (waste calendar) and your town’s waste advice service.',
      pfand: 'Deposit: single-use plastic bottles and cans 25 cents, returnable bottles usually 8–15 cents.',
      sources: 'Sources',
    },
  },
};

const ru: typeof az = {
  wasteSorting: {
    heroTitle: 'Сортировка мусора: Mülltrennung в Германии',
    heroSubtitle: 'Жёлтый мешок, бумага, био, остаточный мусор, стекло, пфанд или Wertstoffhof? Рассортируйте 20 предметов на время — с объяснением после каждого ответа.',
    intro: {
      title: 'Как играть',
      text: '{{n}} предметов, {{sec}} секунд. Верные ответы подряд повышают комбо-множитель (до ×3), быстрые ответы дают бонус. Пока показано объяснение, таймер стоит.',
      controls: 'Нажмите на бак, перетащите предмет на бак или нажмите клавиши 1–7. Enter — дальше.',
      start: 'Начать игру',
      shared: 'Общий раунд: те же предметы.',
    },
    hud: { items: 'Предмет {{n}} / {{total}}', combo: 'Комбо ×{{m}}', streak: '{{n}} подряд' },
    play: {
      prompt: 'Куда это выбросить?',
      drag: 'Перетащите или нажмите на бак',
      bins: 'Баки',
      tricky: 'Каверзный',
    },
    feedback: {
      right: 'Верно! +{{points}}',
      wrongBin: 'Неверно. Правильно: {{bin}}',
      glass: 'Контейнер: {{colour}}',
    },
    glass: { weiss: 'белый', gruen: 'зелёный', braun: 'коричневый' },
    end: {
      title: 'Результат',
      timeUp: 'Время вышло!',
      allDone: 'Всё рассортировано!',
      points: '{{n}} очков',
      stats: '{{correct}} / {{answered}} верно · точность {{accuracy}} % · макс. комбо {{combo}}',
      bonus: 'Бонус за время: +{{n}}',
      newBest: 'Новый рекорд!',
      mistakes: 'Разбор ошибок',
      noMistakes: 'Ни одной ошибки — отлично!',
      yours: 'Ваш ответ: {{bin}}',
      again: 'Новый раунд',
      cardLead: 'Сортировка мусора в Германии — игра',
      cardSub: '{{correct}} / {{answered}} верно · макс. комбо {{combo}}',
    },
    learn: {
      title: 'Что куда: все предметы',
      text: '{{n}} предметов по бакам, с объяснениями. Каверзные случаи отмечены.',
    },
    note: {
      title: 'Важно: правила устанавливает каждая община',
      text: 'В Германии правила обращения с отходами определяет каждая община (Kommune). Здесь — общие рекомендации по стране. Решающее значение имеют ваш местный Abfallkalender (календарь вывоза) и служба Abfallberatung.',
      pfand: 'Пфанд: одноразовые пластиковые бутылки и банки — 25 центов, многоразовые бутылки обычно 8–15 центов.',
      sources: 'Источники',
    },
  },
};

const tr: typeof az = {
  wasteSorting: {
    heroTitle: 'Atık ayrıştırma oyunu: Almanya’da Mülltrennung',
    heroSubtitle: 'Sarı torba, kâğıt, organik, evsel atık, cam, depozito ya da geri dönüşüm merkezi? 20 eşyayı zamana karşı ayırın — her cevaptan sonra açıklama.',
    intro: {
      title: 'Nasıl oynanır',
      text: '{{n}} eşya, {{sec}} saniye. Art arda doğru cevaplar kombo çarpanını artırır (×3’e kadar), hızlı cevaplar bonus puan kazandırır. Açıklama gösterilirken süre durur.',
      controls: 'Bir kutuya dokunun, eşyayı kutuya sürükleyin veya 1–7 tuşlarına basın. Enter — ileri.',
      start: 'Oyunu başlat',
      shared: 'Paylaşılan tur: aynı eşyalar.',
    },
    hud: { items: 'Eşya {{n}} / {{total}}', combo: 'Kombo ×{{m}}', streak: 'art arda {{n}}' },
    play: {
      prompt: 'Bu nereye atılır?',
      drag: 'Sürükleyin veya kutuya dokunun',
      bins: 'Kutular',
      tricky: 'Zor',
    },
    feedback: {
      right: 'Doğru! +{{points}}',
      wrongBin: 'Yanlış. Doğrusu: {{bin}}',
      glass: 'Konteyner: {{colour}}',
    },
    glass: { weiss: 'beyaz', gruen: 'yeşil', braun: 'kahverengi' },
    end: {
      title: 'Sonuç',
      timeUp: 'Süre doldu!',
      allDone: 'Her şey ayrıştırıldı!',
      points: '{{n}} puan',
      stats: '{{correct}} / {{answered}} doğru · isabet {{accuracy}} % · en yüksek kombo {{combo}}',
      bonus: 'Süre bonusu: +{{n}}',
      newBest: 'Yeni rekor!',
      mistakes: 'Hatalarınızı gözden geçirin',
      noMistakes: 'Hiç hata yok — harika!',
      yours: 'Cevabınız: {{bin}}',
      again: 'Yeni tur',
      cardLead: 'Almanya’da atık ayrıştırma — oyun',
      cardSub: '{{correct}} / {{answered}} doğru · en yüksek kombo {{combo}}',
    },
    learn: {
      title: 'Ne nereye: tüm eşyalar',
      text: 'Kutuya göre gruplanmış {{n}} eşya ve açıklamaları. Zor durumlar işaretli.',
    },
    note: {
      title: 'Önemli: kuralları her belediye kendisi belirler',
      text: 'Almanya’da atık kurallarını her belediye (Kommune) belirler. Burada ülke genelindeki yaygın öneriler var. Geçerli olan, yerel Abfallkalender’iniz (atık takvimi) ve belediyenizin atık danışma hizmetidir.',
      pfand: 'Depozito: tek kullanımlık plastik şişe ve kutular 25 sent, depozitolu cam şişeler genelde 8–15 sent.',
      sources: 'Kaynaklar',
    },
  },
};

const uk: typeof az = {
  wasteSorting: {
    heroTitle: 'Сортування сміття: Mülltrennung у Німеччині',
    heroSubtitle: 'Жовтий мішок, папір, біо, залишкове сміття, скло, пфанд чи Wertstoffhof? Розсортуйте 20 предметів на час — із поясненням після кожної відповіді.',
    intro: {
      title: 'Як грати',
      text: '{{n}} предметів, {{sec}} секунд. Правильні відповіді поспіль підвищують комбо-множник (до ×3), швидкі відповіді дають бонус. Поки показано пояснення, таймер стоїть.',
      controls: 'Торкніться бака, перетягніть предмет на бак або натисніть клавіші 1–7. Enter — далі.',
      start: 'Почати гру',
      shared: 'Спільний раунд: ті самі предмети.',
    },
    hud: { items: 'Предмет {{n}} / {{total}}', combo: 'Комбо ×{{m}}', streak: '{{n}} поспіль' },
    play: {
      prompt: 'Куди це викинути?',
      drag: 'Перетягніть або торкніться бака',
      bins: 'Баки',
      tricky: 'Каверзний',
    },
    feedback: {
      right: 'Правильно! +{{points}}',
      wrongBin: 'Неправильно. Правильно: {{bin}}',
      glass: 'Контейнер: {{colour}}',
    },
    glass: { weiss: 'білий', gruen: 'зелений', braun: 'коричневий' },
    end: {
      title: 'Результат',
      timeUp: 'Час вийшов!',
      allDone: 'Усе розсортовано!',
      points: '{{n}} балів',
      stats: '{{correct}} / {{answered}} правильно · точність {{accuracy}} % · макс. комбо {{combo}}',
      bonus: 'Бонус за час: +{{n}}',
      newBest: 'Новий рекорд!',
      mistakes: 'Розбір помилок',
      noMistakes: 'Жодної помилки — чудово!',
      yours: 'Ваша відповідь: {{bin}}',
      again: 'Новий раунд',
      cardLead: 'Сортування сміття в Німеччині — гра',
      cardSub: '{{correct}} / {{answered}} правильно · макс. комбо {{combo}}',
    },
    learn: {
      title: 'Що куди: усі предмети',
      text: '{{n}} предметів за баками, з поясненнями. Каверзні випадки позначено.',
    },
    note: {
      title: 'Важливо: правила встановлює кожна громада',
      text: 'У Німеччині правила поводження з відходами визначає кожна громада (Kommune). Тут — загальні рекомендації по країні. Вирішальні ваш місцевий Abfallkalender (календар вивозу) і служба Abfallberatung.',
      pfand: 'Пфанд: одноразові пластикові пляшки й бляшанки — 25 центів, багаторазові пляшки зазвичай 8–15 центів.',
      sources: 'Джерела',
    },
  },
};

export const pagesWasteSorting = { az, de, en, ru, tr, uk };

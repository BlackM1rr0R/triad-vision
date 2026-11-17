/**
 * German workplace etiquette quiz (/workplace-etiquette): 25 scenario questions with 3–4 options and an
 * explanation each, in the six site languages (German is the original). `kind: 'law'` answers rest on the sources
 * in ./sources.ts (checked 2026-11); `kind: 'custom'` answers describe common practice, not law, and say so.
 * Plain data, no React (unit tests import it).
 */
import type { Tx } from '../games/common';
import type { EtiquetteSourceKey } from './sources';

export type EtiquetteTopic = 'address' | 'time' | 'sick' | 'hours' | 'leave' | 'rights' | 'safety' | 'culture' | 'faith' | 'legal';

export interface EtiquetteQuestion {
  /** Stable id (kebab-case). */
  id: string;
  topic: EtiquetteTopic;
  /** 'law' = a legal rule (with sources); 'custom' = common practice. */
  kind: 'law' | 'custom';
  q: Tx;
  options: Tx[];
  /** Index of the right option. */
  correct: number;
  explain: Tx;
  sources: EtiquetteSourceKey[];
  glossary?: { slug: string; label: string }[];
}

const T = (az: string, de: string, en: string, ru: string, tr: string, uk: string): Tx => ({ az, de, en, ru, tr, uk });

export const ETIQUETTE_QUESTIONS: EtiquetteQuestion[] = [
  {
    id: 'sie-or-du',
    topic: 'address',
    kind: 'custom',
    q: T(
      'İlk iş günüdür. Komanda rəhbəriniz (təxminən 50 yaş) sizə «Guten Morgen, Herr Aliyev» deyir. Ona necə müraciət edirsiniz?',
      'Erster Arbeitstag. Ihre Teamleiterin (etwa 50) sagt: „Guten Morgen, Herr Aliyev.“ Wie sprechen Sie sie an?',
      'First day at work. Your team leader (about 50) says “Guten Morgen, Herr Aliyev.” How do you address her?',
      'Первый рабочий день. Руководитель команды (около 50 лет) говорит вам: «Guten Morgen, Herr Aliyev». Как вы к ней обращаетесь?',
      'İlk iş günü. Ekip lideriniz (yaklaşık 50 yaşında) size “Guten Morgen, Herr Aliyev” diyor. Ona nasıl hitap edersiniz?',
      'Перший робочий день. Керівниця команди (близько 50 років) каже вам: «Guten Morgen, Herr Aliyev». Як ви до неї звертаєтеся?',
    ),
    options: [
      T('Dərhal «du» və adı ilə', 'Sofort mit „du“ und Vornamen', 'Straight away with “du” and her first name', 'Сразу на «du» и по имени', 'Hemen “du” ve ön adıyla', 'Одразу на «du» та на ім’я'),
      T('«Sie» + Frau + soyadı — o, «du» təklif edənə qədər', '„Sie“ + Frau + Nachname – bis sie das Du anbietet', '“Sie” + Frau + surname – until she offers the “du”', '«Sie» + Frau + фамилия — пока она сама не предложит «du»', '“Sie” + Frau + soyadı – o “du” teklif edene kadar', '«Sie» + Frau + прізвище — доки вона сама не запропонує «du»'),
      T('Yalnız adı ilə, «Sie» olmadan', 'Nur mit Vornamen, ohne „Sie“', 'Only by her first name, without “Sie”', 'Только по имени, без «Sie»', 'Sadece ön adıyla, “Sie” olmadan', 'Лише на ім’я, без «Sie»'),
    ],
    correct: 1,
    explain: T(
      'İşdə standart forma «Sie» və soyaddır. «Du»nu adətən yaşca böyük və ya vəzifəcə yuxarı olan şəxs təklif edir. Bir çox tikinti meydançasında, mətbəxdə və emalatxanada isə həmkarlar ilk gündən «du» deyirlər — başqalarının necə danışdığına baxın. Bu qanun deyil, adətdir.',
      'Im Beruf ist „Sie“ mit Nachnamen der Standard. Das „Du“ bietet meist die ältere oder ranghöhere Person an. Auf vielen Baustellen, in Küchen und Werkstätten duzen sich Kollegen aber vom ersten Tag an – achten Sie darauf, wie die anderen sprechen. Das ist Brauch, kein Gesetz.',
      'At work, “Sie” with the surname is the default. The “du” is usually offered by the older or more senior person. On many building sites, in kitchens and workshops, colleagues use “du” from day one – watch how the others talk. This is custom, not law.',
      'На работе по умолчанию «Sie» и фамилия. «Du» обычно предлагает старший по возрасту или по должности. На многих стройках, кухнях и в мастерских коллеги с первого дня говорят «du» — смотрите, как говорят другие. Это обычай, а не закон.',
      'İş yerinde varsayılan “Sie” ve soyadıdır. “Du”yu genellikle yaşça büyük ya da daha üst pozisyondaki kişi teklif eder. Pek çok şantiyede, mutfakta ve atölyede ise iş arkadaşları ilk günden “du” der – diğerlerinin nasıl konuştuğuna bakın. Bu yasa değil, gelenektir.',
      'На роботі за замовчуванням «Sie» і прізвище. «Du» зазвичай пропонує старша за віком або посадою людина. На багатьох будівництвах, кухнях і в майстернях колеги з першого дня кажуть «du» — дивіться, як говорять інші. Це звичай, а не закон.',
    ),
    sources: [],
  },
  {
    id: 'du-offered',
    topic: 'address',
    kind: 'custom',
    q: T(
      'Həmkarınız deyir: «Wir duzen uns hier alle, ich bin Jana.» Nə edirsiniz?',
      'Eine Kollegin sagt: „Wir duzen uns hier alle, ich bin Jana.“ Was tun Sie?',
      'A colleague says: “Wir duzen uns hier alle, ich bin Jana.” What do you do?',
      'Коллега говорит: «Wir duzen uns hier alle, ich bin Jana». Что вы делаете?',
      'Bir iş arkadaşınız diyor ki: “Wir duzen uns hier alle, ich bin Jana.” Ne yaparsınız?',
      'Колега каже: «Wir duzen uns hier alle, ich bin Jana». Що ви робите?',
    ),
    options: [
      T('Hörmət üçün yenə də «Sie» deyirəm', 'Ich sage aus Respekt weiter „Sie“', 'I keep saying “Sie” out of respect', 'Из уважения продолжаю говорить «Sie»', 'Saygıdan dolayı “Sie” demeye devam ederim', 'З поваги й далі кажу «Sie»'),
      T('Əvvəlcə müdirdən icazə istəyirəm', 'Ich frage erst den Chef um Erlaubnis', 'I first ask the boss for permission', 'Сначала спрашиваю разрешения у начальника', 'Önce şeften izin isterim', 'Спершу питаю дозволу в начальника'),
      T('Qəbul edirəm: «Gerne, ich bin Elvin.» — və «du» deyirəm', 'Ich nehme an: „Gerne, ich bin Elvin.“ – und duze sie', 'I accept: “Gerne, ich bin Elvin.” – and use “du”', 'Соглашаюсь: «Gerne, ich bin Elvin» — и перехожу на «du»', 'Kabul ederim: “Gerne, ich bin Elvin.” – ve “du” derim', 'Погоджуюся: «Gerne, ich bin Elvin» — і переходжу на «du»'),
    ],
    correct: 2,
    explain: T(
      '«Du» təklif olunubsa, qəbul etmək normaldır. «Sie»də israr etmək soyuq və məsafəli görünə bilər. Rəhbərlə isə «Sie» qalır — o özü «du» təklif etməyənə qədər.',
      'Wenn Ihnen das Du angeboten wird, nehmen Sie es an. Beim „Sie“ zu bleiben, wirkt sonst schnell kühl und distanziert. Bei Vorgesetzten bleibt es beim „Sie“, bis sie selbst das Du anbieten.',
      'When the “du” is offered, accept it. Insisting on “Sie” can come across as cold and distant. With your managers it stays “Sie” until they offer the “du” themselves.',
      'Если вам предложили «du», соглашайтесь. Если остаться на «Sie», это может показаться холодным и отстранённым. С начальством остаётся «Sie», пока оно само не предложит «du».',
      '“Du” teklif edildiyse kabul edin. “Sie”de ısrar etmek soğuk ve mesafeli görünebilir. Yöneticilerle ise onlar teklif edene kadar “Sie” kalır.',
      'Якщо вам запропонували «du», погоджуйтеся. Наполягати на «Sie» може здатися холодним і відстороненим. З керівництвом залишається «Sie», доки воно саме не запропонує «du».',
    ),
    sources: [],
  },
  {
    id: 'shift-start',
    topic: 'time',
    kind: 'custom',
    q: T(
      'Növbəniz saat 7:00-da başlayır. Nə vaxt gəlirsiniz?',
      'Ihre Schicht beginnt um 7:00 Uhr. Wann sind Sie da?',
      'Your shift starts at 7:00. When do you arrive?',
      'Смена начинается в 7:00. Когда вы приходите?',
      'Vardiyanız 7:00’de başlıyor. Ne zaman gelirsiniz?',
      'Зміна починається о 7:00. Коли ви приходите?',
    ),
    options: [
      T('Bir neçə dəqiqə əvvəl — 7:00-da iş geyimində iş yerimdə oluram', 'Ein paar Minuten vorher – um 7:00 stehe ich umgezogen am Arbeitsplatz', 'A few minutes early – at 7:00 I am changed and at my workstation', 'За несколько минут — в 7:00 я уже переодет и на рабочем месте', 'Birkaç dakika önce – 7:00’de üstümü değiştirmiş, iş başında olurum', 'За кілька хвилин — о 7:00 я вже перевдягнений і на робочому місці'),
      T('Düz 7:00-da qapıdan girirəm, sonra paltar dəyişirəm', 'Punkt 7:00 durch die Tür, dann umziehen', 'Through the door at 7:00 sharp, then change', 'Ровно в 7:00 захожу, потом переодеваюсь', 'Tam 7:00’de kapıdan girerim, sonra üstümü değiştiririm', 'Рівно о 7:00 заходжу, потім перевдягаюся'),
      T('7:10 — 10 dəqiqə problem deyil', 'Um 7:10 – zehn Minuten sind kein Problem', 'At 7:10 – ten minutes are no problem', 'В 7:10 — десять минут не проблема', '7:10’da – on dakika sorun değil', 'О 7:10 — десять хвилин не проблема'),
    ],
    correct: 0,
    explain: T(
      'Almaniyada dəqiqlik çox vacibdir: «7:00» adətən iş yerində işə başlamaq deməkdir. Paltar dəyişmə vaxtının iş vaxtına daxil olub-olmaması müqavilədən və ya kollektiv müqavilədən asılıdır — soruşun.',
      'Pünktlichkeit ist in Deutschland sehr wichtig: „7:00 Uhr“ heißt meist Arbeitsbeginn am Arbeitsplatz. Ob das Umziehen Arbeitszeit ist, regeln Arbeits- oder Tarifvertrag – fragen Sie nach.',
      'Punctuality matters a lot in Germany: “7:00” usually means starting work at your workstation. Whether changing clothes counts as working time depends on your contract or collective agreement – ask.',
      'Пунктуальность в Германии очень важна: «7:00» обычно означает начало работы на рабочем месте. Считается ли переодевание рабочим временем, решает трудовой или коллективный договор — уточните.',
      'Almanya’da dakiklik çok önemlidir: “7:00” genellikle iş başında çalışmaya başlamak demektir. Üst değiştirmenin çalışma süresine sayılıp sayılmadığı iş ya da toplu sözleşmeye bağlıdır – sorun.',
      'Пунктуальність у Німеччині дуже важлива: «7:00» зазвичай означає початок роботи на робочому місці. Чи вважається перевдягання робочим часом, вирішує трудовий або колективний договір — уточніть.',
    ),
    sources: [],
    glossary: [{ slug: 'arbeitszeit', label: 'Arbeitszeit' }],
  },
  {
    id: 'running-late',
    topic: 'time',
    kind: 'custom',
    q: T(
      'Qatarınız ləğv olunub, 20 dəqiqə gecikəcəksiniz. Nə edirsiniz?',
      'Ihr Zug fällt aus, Sie kommen 20 Minuten zu spät. Was tun Sie?',
      'Your train is cancelled; you will be 20 minutes late. What do you do?',
      'Ваш поезд отменили, вы опоздаете на 20 минут. Что вы делаете?',
      'Treniniz iptal oldu, 20 dakika geç kalacaksınız. Ne yaparsınız?',
      'Ваш потяг скасували, ви запізнитеся на 20 хвилин. Що ви робите?',
    ),
    options: [
      T('Gəlib hər şeyi orada izah edirəm', 'Ich komme und erkläre es vor Ort', 'I arrive and explain it there', 'Приезжаю и объясняю на месте', 'Gelip orada açıklarım', 'Приїжджаю і пояснюю на місці'),
      T('Növbədən əvvəl rəhbərə zəng edir/yazıram və nə vaxt gələcəyimi deyirəm', 'Ich rufe vor Schichtbeginn an oder schreibe und sage, wann ich da bin', 'Before the shift starts I call or message my supervisor and say when I will arrive', 'До начала смены звоню или пишу руководителю и говорю, когда буду', 'Vardiya başlamadan amirimi arar ya da yazarım ve ne zaman geleceğimi söylerim', 'До початку зміни телефоную або пишу керівнику й кажу, коли буду'),
      T('Ümumiyyətlə gəlmirəm — gün onsuz da pozulub', 'Ich komme gar nicht – der Tag ist eh verloren', 'I don’t come at all – the day is ruined anyway', 'Вообще не прихожу — день всё равно потерян', 'Hiç gitmem – gün zaten mahvoldu', 'Взагалі не приходжу — день усе одно втрачено'),
    ],
    correct: 1,
    explain: T(
      'Gecikməyi əvvəlcədən bildirmək hörmət sayılır: komanda planı dəyişə bilir. Xəbərsiz gecikmək və ya gəlməmək xəbərdarlığa (Abmahnung) səbəb ola bilər.',
      'Wer eine Verspätung vorher meldet, zeigt Respekt – das Team kann umplanen. Unangekündigtes Zuspätkommen oder Fehlen kann zu einer Abmahnung führen.',
      'Reporting a delay in advance is a sign of respect – the team can re-plan. Coming late or staying away without notice can lead to a formal warning (Abmahnung).',
      'Сообщить об опоздании заранее — знак уважения: команда может перестроиться. Опоздание или отсутствие без предупреждения может привести к предупреждению (Abmahnung).',
      'Gecikmeyi önceden bildirmek saygı göstergesidir – ekip planı değiştirebilir. Habersiz geç kalmak ya da gelmemek ihtara (Abmahnung) yol açabilir.',
      'Повідомити про запізнення заздалегідь — знак поваги: команда може переплануватися. Запізнення чи відсутність без попередження можуть призвести до попередження (Abmahnung).',
    ),
    sources: [],
  },
  {
    id: 'calling-in-sick',
    topic: 'sick',
    kind: 'law',
    q: T(
      'Səhər qızdırma ilə oyanırsınız. Nə edirsiniz?',
      'Sie wachen morgens mit Fieber auf. Was tun Sie?',
      'You wake up with a fever. What do you do?',
      'Утром вы просыпаетесь с температурой. Что вы делаете?',
      'Sabah ateşle uyanıyorsunuz. Ne yaparsınız?',
      'Зранку ви прокидаєтеся з температурою. Що ви робите?',
    ),
    options: [
      T('Dərhal — növbədən əvvəl — işəgötürənə xəbər verirəm və nə qədər çəkə biləcəyini deyirəm', 'Ich melde mich sofort – vor Schichtbeginn – beim Arbeitgeber krank und sage, wie lange es voraussichtlich dauert', 'I tell my employer right away – before the shift – that I am sick and how long it will probably last', 'Сразу — до начала смены — сообщаю работодателю, что болен, и примерно на сколько', 'Hemen – vardiyadan önce – işverene hasta olduğumu ve tahminen ne kadar süreceğini bildiririm', 'Одразу — до початку зміни — повідомляю роботодавця, що хворію, і приблизно на скільки'),
      T('Bir həftədən sonra həkim arayışını göndərirəm', 'Ich schicke nach einer Woche die Krankschreibung', 'I send the sick note after a week', 'Через неделю отправляю больничный', 'Bir hafta sonra rapor gönderirim', 'Через тиждень надсилаю лікарняний'),
      T('Nahar vaxtı həmkardan xahiş edirəm ki, desin', 'Ich bitte einen Kollegen, es mittags Bescheid zu sagen', 'I ask a colleague to pass it on at lunchtime', 'Прошу коллегу передать в обед', 'Öğlen söylemesi için bir iş arkadaşımdan rica ederim', 'Прошу колегу передати в обід'),
    ],
    correct: 0,
    explain: T(
      'EntgFG-nin § 5-inə görə işə yararsızlığı və onun ehtimal olunan müddətini işəgötürənə «dərhal» (unverzüglich) bildirmək lazımdır — praktikada növbə başlamazdan əvvəl, şirkətin qaydasına uyğun (adətən telefonla).',
      'Nach § 5 EntgFG müssen Sie die Arbeitsunfähigkeit und ihre voraussichtliche Dauer „unverzüglich“ mitteilen – praktisch vor Schichtbeginn und so, wie es die Firma vorgibt (meist telefonisch).',
      'Under § 5 EntgFG you must report your incapacity to work and its expected duration “without delay” – in practice before your shift starts and the way your company asks (usually by phone).',
      'По § 5 EntgFG о нетрудоспособности и её предполагаемой длительности нужно сообщить «незамедлительно» — на практике до начала смены и так, как принято в фирме (обычно по телефону).',
      'EntgFG § 5’e göre çalışamama durumunu ve tahmini süresini “gecikmeksizin” bildirmeniz gerekir – pratikte vardiyadan önce ve şirketin istediği şekilde (genellikle telefonla).',
      'За § 5 EntgFG про непрацездатність і її ймовірну тривалість треба повідомити «негайно» — на практиці до початку зміни і так, як заведено у фірмі (зазвичай телефоном).',
    ),
    sources: ['entgfg5'],
    glossary: [{ slug: 'krankmeldung', label: 'Krankmeldung' }],
  },
  {
    id: 'sick-note-when',
    topic: 'sick',
    kind: 'law',
    q: T(
      'Həkim arayışı (AU) nə vaxt lazımdır?',
      'Ab wann brauchen Sie eine ärztliche Arbeitsunfähigkeitsbescheinigung (AU)?',
      'When do you need a doctor’s certificate of incapacity (AU)?',
      'С какого момента нужна справка о нетрудоспособности от врача (AU)?',
      'Doktordan çalışamaz raporu (AU) ne zaman gerekir?',
      'З якого моменту потрібна довідка лікаря про непрацездатність (AU)?',
    ),
    options: [
      T('Yalnız iki həftədən sonra', 'Erst nach zwei Wochen', 'Only after two weeks', 'Только через две недели', 'Ancak iki haftadan sonra', 'Лише через два тижні'),
      T('Heç vaxt — zəng etmək kifayətdir', 'Nie – ein Anruf reicht', 'Never – a call is enough', 'Никогда — достаточно звонка', 'Hiçbir zaman – bir telefon yeter', 'Ніколи — дзвінка достатньо'),
      T('Xəstəlik 3 təqvim günündən çox çəkirsə, ən gec növbəti iş günü; müqavilə daha tez tələb edə bilər', 'Wenn die Krankheit länger als 3 Kalendertage dauert, spätestens am folgenden Arbeitstag – der Arbeitgeber kann sie früher verlangen', 'If the illness lasts longer than 3 calendar days, by the next working day at the latest – the employer may ask for it earlier', 'Если болезнь длится дольше 3 календарных дней — не позднее следующего рабочего дня; работодатель может требовать раньше', 'Hastalık 3 takvim gününden uzun sürerse en geç bir sonraki iş günü – işveren daha erken isteyebilir', 'Якщо хвороба триває довше ніж 3 календарні дні — не пізніше наступного робочого дня; роботодавець може вимагати раніше'),
    ],
    correct: 2,
    explain: T(
      '§ 5 EntgFG: 3 təqvim günündən çox xəstəlikdə arayış ən gec növbəti iş günü lazımdır (yəni 4-cü gündən), lakin işəgötürən onu daha tez — hətta 1-ci gündən — tələb edə bilər; müqaviləyə baxın. Dövlət sığortası ilə arayış elektron (eAU) gedir: həkim onu sığorta kassasına göndərir, işəgötürən oradan götürür. Həkimə getmək və işəgötürənə xəbər vermək yenə sizin vəzifənizdir.',
      '§ 5 EntgFG: Dauert die Krankheit länger als 3 Kalendertage, muss die AU spätestens am folgenden Arbeitstag vorliegen (also ab Tag 4) – der Arbeitgeber darf sie aber früher verlangen, auch ab Tag 1; schauen Sie in den Vertrag. Bei gesetzlich Versicherten läuft das elektronisch (eAU): Die Praxis meldet sie der Krankenkasse, der Arbeitgeber ruft sie dort ab. Zum Arzt gehen und sich beim Arbeitgeber melden müssen Sie trotzdem.',
      '§ 5 EntgFG: if you are ill for more than 3 calendar days, the certificate is due by the next working day at the latest (i.e. from day 4) – but the employer may ask for it earlier, even from day 1; check your contract. With statutory insurance it is electronic (eAU): the doctor sends it to the health insurer and the employer retrieves it there. You still have to see the doctor and inform your employer.',
      '§ 5 EntgFG: если болезнь длится больше 3 календарных дней, справка нужна не позднее следующего рабочего дня (то есть с 4-го дня), но работодатель может требовать её раньше — даже с 1-го дня; смотрите договор. При государственной страховке это электронно (eAU): врач передаёт её в больничную кассу, работодатель запрашивает там. Сходить к врачу и сообщить работодателю всё равно должны вы.',
      '§ 5 EntgFG: Hastalık 3 takvim gününden uzun sürerse rapor en geç bir sonraki iş günü verilmelidir (yani 4. günden itibaren) – ama işveren daha erken, 1. günden bile isteyebilir; sözleşmenize bakın. Yasal sigortalılarda elektroniktir (eAU): doktor sigortaya bildirir, işveren oradan alır. Doktora gitmek ve işverene haber vermek yine sizin görevinizdir.',
      '§ 5 EntgFG: якщо хвороба триває понад 3 календарні дні, довідка потрібна не пізніше наступного робочого дня (тобто з 4-го дня), але роботодавець може вимагати її раніше — навіть з 1-го дня; дивіться договір. За державного страхування це електронно (eAU): лікар передає її до лікарняної каси, роботодавець отримує там. Піти до лікаря й повідомити роботодавця все одно маєте ви.',
    ),
    sources: ['entgfg5'],
    glossary: [{ slug: 'arbeitsunfaehigkeitsbescheinigung', label: 'Arbeitsunfähigkeitsbescheinigung' }],
  },
  {
    id: 'sick-weekend',
    topic: 'sick',
    kind: 'law',
    q: T(
      'Cümə, şənbə, bazar və bazar ertəsi xəstəsiniz. Arayış lazımdırmı?',
      'Sie sind Freitag, Samstag, Sonntag und Montag krank. Brauchen Sie eine AU?',
      'You are sick Friday, Saturday, Sunday and Monday. Do you need a certificate?',
      'Вы болеете в пятницу, субботу, воскресенье и понедельник. Нужна ли справка?',
      'Cuma, cumartesi, pazar ve pazartesi hastasınız. Rapor gerekir mi?',
      'Ви хворієте в п’ятницю, суботу, неділю й понеділок. Чи потрібна довідка?',
    ),
    options: [
      T('Xeyr, həftəsonu sayılmır', 'Nein, das Wochenende zählt nicht', 'No, the weekend doesn’t count', 'Нет, выходные не считаются', 'Hayır, hafta sonu sayılmaz', 'Ні, вихідні не рахуються'),
      T('Bəli — təqvim günləri, həftəsonu da daxil olmaqla, sayılır: 4 gün', 'Ja – es zählen Kalendertage, auch das Wochenende: 4 Tage', 'Yes – calendar days count, weekend included: 4 days', 'Да — считаются календарные дни, включая выходные: 4 дня', 'Evet – takvim günleri sayılır, hafta sonu dahil: 4 gün', 'Так — рахуються календарні дні, включно з вихідними: 4 дні'),
      T('Yalnız müdir soruşsa', 'Nur wenn der Chef fragt', 'Only if the boss asks', 'Только если начальник спросит', 'Sadece şef sorarsa', 'Лише якщо начальник спитає'),
    ],
    correct: 1,
    explain: T(
      'Qanun «təqvim günləri» deyir, iş günləri yox. Cümədən bazar ertəsinə qədər 4 gündür — 3-dən çox, deməli arayış lazımdır.',
      'Das Gesetz spricht von Kalendertagen, nicht von Arbeitstagen. Freitag bis Montag sind 4 Tage – mehr als 3, also ist eine AU nötig.',
      'The law says calendar days, not working days. Friday to Monday is 4 days – more than 3, so a certificate is needed.',
      'Закон говорит о календарных днях, а не о рабочих. С пятницы по понедельник — 4 дня, больше 3, значит справка нужна.',
      'Yasa iş günü değil takvim günü der. Cuma’dan pazartesiye 4 gün eder – 3’ten fazla, yani rapor gerekir.',
      'Закон говорить про календарні дні, а не робочі. З п’ятниці до понеділка — 4 дні, більше ніж 3, отже довідка потрібна.',
    ),
    sources: ['entgfg5'],
  },
  {
    id: 'feierabend',
    topic: 'hours',
    kind: 'custom',
    q: T(
      'Saat 16:00-dır — iş gününüz bitib. Həmkarınız hələ işləyir, rəhbər heç nə demir. Nə edirsiniz?',
      'Es ist 16:00 Uhr – Feierabend. Ein Kollege arbeitet noch, der Chef sagt nichts. Was tun Sie?',
      'It is 16:00 – end of your working day (Feierabend). A colleague is still working, the boss says nothing. What do you do?',
      '16:00 — конец рабочего дня (Feierabend). Коллега ещё работает, начальник ничего не говорит. Что вы делаете?',
      'Saat 16:00 – mesai bitti (Feierabend). Bir iş arkadaşınız hâlâ çalışıyor, şef bir şey demiyor. Ne yaparsınız?',
      '16:00 — кінець робочого дня (Feierabend). Колега ще працює, начальник нічого не каже. Що ви робите?',
    ),
    options: [
      T('Rəhbər gedənə qədər qalıram', 'Ich bleibe, bis der Chef geht', 'I stay until the boss leaves', 'Остаюсь, пока не уйдёт начальник', 'Şef gidene kadar kalırım', 'Залишаюся, доки не піде начальник'),
      T('İşi qaydasında bitirir, «Schönen Feierabend!» deyib gedirəm', 'Ich schließe meine Aufgabe sauber ab, sage „Schönen Feierabend!“ und gehe', 'I wrap up my task properly, say “Schönen Feierabend!” and leave', 'Аккуратно завершаю задачу, говорю «Schönen Feierabend!» и ухожу', 'İşimi düzgünce bitirir, “Schönen Feierabend!” der ve çıkarım', 'Акуратно завершую завдання, кажу «Schönen Feierabend!» і йду'),
      T('Tapşırığın ortasında heç nə demədən gedirəm', 'Ich gehe mitten in der Aufgabe ohne ein Wort', 'I leave in the middle of the task without a word', 'Ухожу посреди задачи, ничего не сказав', 'İşin ortasında tek kelime etmeden çıkarım', 'Іду посеред завдання, нічого не сказавши'),
    ],
    correct: 1,
    explain: T(
      'Almaniyada iş gününün sonu (Feierabend) hörmətlə qarşılanır: könüllü gec qalmaq gözlənilmir. Əlavə iş razılaşdırılarsa olur. Təcili iş qalıbsa, qısa təhvil verin.',
      'Feierabend wird in Deutschland respektiert: Freiwilliges Länger-Bleiben wird nicht erwartet. Überstunden gibt es, wenn sie vereinbart werden. Bleibt etwas Dringendes liegen, kurz übergeben.',
      'Feierabend is respected in Germany: nobody expects you to stay late voluntarily. Overtime happens when it is agreed. If something urgent is left, hand it over briefly.',
      'В Германии конец рабочего дня уважают: задерживаться добровольно никто не ждёт. Сверхурочные бывают, если о них договорились. Если осталось что-то срочное — коротко передайте.',
      'Almanya’da mesai bitimine saygı duyulur: gönüllü olarak geç kalmanız beklenmez. Fazla mesai, kararlaştırılırsa olur. Acil bir iş kaldıysa kısaca devredin.',
      'У Німеччині кінець робочого дня поважають: затримуватися добровільно ніхто не чекає. Понаднормові бувають, якщо про них домовилися. Якщо лишилося щось термінове — коротко передайте.',
    ),
    sources: [],
  },
  {
    id: 'overtime',
    topic: 'hours',
    kind: 'law',
    q: T(
      'Rəhbər bu gün 2 saat artıq qalmağınızı xahiş edir. Hansı doğrudur?',
      'Der Chef bittet Sie, heute 2 Stunden länger zu bleiben. Was stimmt?',
      'The boss asks you to stay 2 hours longer today. What is true?',
      'Начальник просит вас сегодня задержаться на 2 часа. Что верно?',
      'Şef bugün 2 saat fazla kalmanızı istiyor. Hangisi doğru?',
      'Начальник просить вас сьогодні затриматися на 2 години. Що правильно?',
    ),
    options: [
      T('Əlavə saatlar həmişə ödənişsizdir', 'Überstunden sind immer unbezahlt', 'Overtime is always unpaid', 'Сверхурочные всегда не оплачиваются', 'Fazla mesai her zaman ücretsizdir', 'Понаднормові завжди не оплачуються'),
      T('Həmişə «bəli» deməlisiniz, nə qədər olsa da', 'Sie müssen immer Ja sagen, egal wie lange', 'You must always say yes, however long', 'Вы всегда должны соглашаться, сколько бы ни было', 'Ne kadar olursa olsun her zaman evet demelisiniz', 'Ви завжди мусите погоджуватися, скільки б не було'),
      T('Müqavilədə nə yazılıbsa: pul və ya istirahət vaxtı ilə əvəz; saatlarınızı qeyd edin; gündə adətən 10 saatdan çox olmaz', 'Wie im Vertrag geregelt: bezahlt oder mit Freizeit ausgeglichen; Stunden notieren; meist höchstens 10 Stunden am Tag', 'As your contract says: paid or compensated with time off; note your hours; usually no more than 10 hours a day', 'Как в договоре: оплата или отгул; записывайте часы; обычно не больше 10 часов в день', 'Sözleşmede ne yazıyorsa: ücret ya da izinle telafi; saatlerinizi not edin; genellikle günde en fazla 10 saat', 'Як у договорі: оплата або відгул; записуйте години; зазвичай не більше 10 годин на день'),
    ],
    correct: 2,
    explain: T(
      'Əlavə işi müqavilə, kollektiv müqavilə və ya fövqəladə hal tənzimləyir; o, ödənilir və ya istirahətlə əvəz olunur — müqaviləyə baxın. ArbZG § 3: gündə 8 saat, 6 ay ərzində orta hesabla 8 saat qalmaq şərtilə 10 saata qədər. Saatlarınızı özünüz də yazın.',
      'Überstunden regeln Arbeitsvertrag, Tarifvertrag oder Notfälle; sie werden bezahlt oder mit Freizeit ausgeglichen – siehe Vertrag. § 3 ArbZG: 8 Stunden pro Werktag, bis 10 Stunden, wenn im Schnitt von 6 Monaten 8 Stunden nicht überschritten werden. Notieren Sie Ihre Stunden selbst mit.',
      'Overtime is governed by your contract, a collective agreement or emergencies; it is paid or compensated with time off – see your contract. § 3 ArbZG: 8 hours per working day, up to 10 if the 6-month average stays at 8. Keep your own record of hours.',
      'Сверхурочные регулируют трудовой или коллективный договор либо чрезвычайные случаи; их оплачивают или компенсируют отгулами — см. договор. § 3 ArbZG: 8 часов в рабочий день, до 10, если в среднем за 6 месяцев не больше 8. Записывайте свои часы сами.',
      'Fazla mesaiyi iş sözleşmesi, toplu sözleşme ya da acil durumlar düzenler; ücretle ya da izinle telafi edilir – sözleşmeye bakın. ArbZG § 3: iş günü başına 8 saat, 6 aylık ortalama 8 saati aşmamak şartıyla 10 saate kadar. Saatlerinizi kendiniz de not edin.',
      'Понаднормові регулюють трудовий чи колективний договір або надзвичайні ситуації; їх оплачують або компенсують відгулами — див. договір. § 3 ArbZG: 8 годин на робочий день, до 10, якщо в середньому за 6 місяців не більше 8. Записуйте свої години самі.',
    ),
    sources: ['arbzg3'],
    glossary: [{ slug: 'ueberstunden', label: 'Überstunden' }],
  },
  {
    id: 'breaks',
    topic: 'hours',
    kind: 'law',
    q: T(
      '8 saatlıq iş günündə qanunla ən azı nə qədər fasilə var?',
      'Wie viel Pause steht Ihnen bei 8 Stunden Arbeit gesetzlich mindestens zu?',
      'How much break do you get by law, at least, for 8 hours of work?',
      'Какой минимальный перерыв положен по закону при 8 часах работы?',
      '8 saatlik çalışmada yasal olarak en az ne kadar mola hakkınız var?',
      'Яка мінімальна перерва належить за законом при 8 годинах роботи?',
    ),
    options: [
      T('Ümumilikdə 15 dəqiqə', '15 Minuten insgesamt', '15 minutes in total', '15 минут всего', 'Toplam 15 dakika', '15 хвилин загалом'),
      T('30 dəqiqə — 15 dəqiqəlik hissələrə bölmək olar; 6 saatdan çox fasiləsiz işləmək olmaz', '30 Minuten – teilbar in Blöcke von 15 Minuten; nie mehr als 6 Stunden am Stück ohne Pause', '30 minutes – can be split into 15-minute blocks; never more than 6 hours in a row without a break', '30 минут — можно делить на части по 15 минут; не больше 6 часов подряд без перерыва', '30 dakika – 15’er dakikalık parçalara bölünebilir; molasız 6 saatten fazla çalışılmaz', '30 хвилин — можна ділити на частини по 15 хвилин; не більше 6 годин поспіль без перерви'),
      T('60 dəqiqə ödənişli', '60 Minuten bezahlt', '60 minutes, paid', '60 минут, оплачиваемых', '60 dakika, ücretli', '60 хвилин, оплачуваних'),
    ],
    correct: 1,
    explain: T(
      'ArbZG § 4: 6 saatdan 9 saata qədər iş üçün ən azı 30 dəqiqə, 9 saatdan çox iş üçün 45 dəqiqə fasilə. Fasilələri 15 dəqiqəlik hissələrə bölmək olar. Fasilə adətən ödənilmir — müqavilə başqa cür demirsə.',
      '§ 4 ArbZG: mehr als 6 bis 9 Stunden Arbeit → mindestens 30 Minuten Pause, mehr als 9 Stunden → 45 Minuten. Pausen dürfen in Abschnitte von je 15 Minuten geteilt werden. Pausen sind in der Regel unbezahlt, wenn der Vertrag nichts anderes sagt.',
      '§ 4 ArbZG: more than 6 and up to 9 hours of work → at least 30 minutes’ break, more than 9 hours → 45 minutes. Breaks can be split into parts of 15 minutes each. Breaks are usually unpaid unless your contract says otherwise.',
      '§ 4 ArbZG: более 6 и до 9 часов работы → минимум 30 минут перерыва, более 9 часов → 45 минут. Перерывы можно делить на части по 15 минут. Обычно перерывы не оплачиваются, если в договоре не сказано иное.',
      'ArbZG § 4: 6 saatten fazla 9 saate kadar çalışmada en az 30 dakika, 9 saatten fazlasında 45 dakika mola. Molalar 15’er dakikalık parçalara bölünebilir. Sözleşme aksini söylemedikçe molalar genellikle ücretsizdir.',
      '§ 4 ArbZG: понад 6 і до 9 годин роботи → щонайменше 30 хвилин перерви, понад 9 годин → 45 хвилин. Перерви можна ділити на частини по 15 хвилин. Зазвичай перерви не оплачуються, якщо договір не каже інакше.',
    ),
    sources: ['arbzg4'],
    glossary: [{ slug: 'arbeitszeit', label: 'Arbeitszeit' }],
  },
  {
    id: 'skip-break',
    topic: 'hours',
    kind: 'law',
    q: T(
      '8 saatlıq növbədə fasiləni buraxıb 30 dəqiqə tez getmək istəyirsiniz. Olarmı?',
      'Sie möchten bei einer 8-Stunden-Schicht die Pause auslassen und 30 Minuten früher gehen. Geht das?',
      'On an 8-hour shift you want to skip your break and leave 30 minutes early. Is that allowed?',
      'В 8-часовую смену вы хотите пропустить перерыв и уйти на 30 минут раньше. Можно?',
      '8 saatlik vardiyada molayı atlayıp 30 dakika erken çıkmak istiyorsunuz. Olur mu?',
      'У 8-годинну зміну ви хочете пропустити перерву й піти на 30 хвилин раніше. Можна?',
    ),
    options: [
      T('Bəli, öz qərarımdır', 'Ja, das entscheide ich selbst', 'Yes, that is my own decision', 'Да, это моё решение', 'Evet, bu benim kararım', 'Так, це моє рішення'),
      T('Yalnız yayda', 'Nur im Sommer', 'Only in summer', 'Только летом', 'Sadece yazın', 'Лише влітку'),
      T('Xeyr — 6 saatdan çox işdə fasilə qanunla məcburidir və sizi qoruyur', 'Nein – bei mehr als 6 Stunden ist die Pause gesetzlich Pflicht und schützt Sie', 'No – for more than 6 hours of work the break is required by law and protects you', 'Нет — при работе более 6 часов перерыв обязателен по закону и защищает вас', 'Hayır – 6 saatten fazla çalışmada mola yasal zorunluluktur ve sizi korur', 'Ні — за роботи понад 6 годин перерва обов’язкова за законом і захищає вас'),
    ],
    correct: 2,
    explain: T(
      'ArbZG § 4 deyir: 6 saatdan çox fasiləsiz işləmək olmaz. Fasilə yorğunluq və qəzalardan qoruyur; onu «dəyişmək» olmaz, hətta özünüz istəsəniz belə.',
      '§ 4 ArbZG: Länger als 6 Stunden hintereinander darf niemand ohne Pause arbeiten. Die Pause schützt vor Übermüdung und Unfällen – man kann sie nicht „eintauschen“, auch wenn man es selbst möchte.',
      '§ 4 ArbZG: nobody may work more than 6 hours in a row without a break. The break protects against fatigue and accidents – you cannot “trade” it, even if you want to.',
      '§ 4 ArbZG: никто не может работать больше 6 часов подряд без перерыва. Перерыв защищает от усталости и несчастных случаев — его нельзя «обменять», даже если вы сами хотите.',
      'ArbZG § 4: Kimse 6 saatten fazla molasız çalışamaz. Mola yorgunluğa ve kazalara karşı korur – kendiniz isteseniz bile “takas” edemezsiniz.',
      '§ 4 ArbZG: ніхто не може працювати понад 6 годин поспіль без перерви. Перерва захищає від утоми й нещасних випадків — її не можна «обміняти», навіть якщо ви самі хочете.',
    ),
    sources: ['arbzg4'],
  },
  {
    id: 'vacation-request',
    topic: 'leave',
    kind: 'law',
    q: T(
      'Avqustda 2 həftə Bakıya uçmaq istəyirsiniz. Necə düzgündür?',
      'Sie möchten im August 2 Wochen nach Baku fliegen. Wie geht es richtig?',
      'You want to fly to Baku for 2 weeks in August. What is the right way?',
      'Вы хотите в августе на 2 недели слетать в Баку. Как правильно?',
      'Ağustosta 2 haftalığına Bakü’ye uçmak istiyorsunuz. Doğrusu nasıl?',
      'Ви хочете в серпні на 2 тижні полетіти до Баку. Як правильно?',
    ),
    options: [
      T('Əvvəlcə bilet alıram, sonra müdirə deyirəm', 'Erst Flug buchen, dann dem Chef sagen', 'Book the flight first, then tell the boss', 'Сначала покупаю билет, потом говорю начальнику', 'Önce bileti alırım, sonra şefe söylerim', 'Спершу купую квиток, потім кажу начальнику'),
      T('Erkən məzuniyyət ərizəsi (Urlaubsantrag) verirəm və təsdiqdən sonra bilet alıram', 'Früh einen Urlaubsantrag stellen und erst nach der Genehmigung buchen', 'Submit a leave request (Urlaubsantrag) early and book only after it is approved', 'Заранее подаю заявление на отпуск (Urlaubsantrag) и покупаю билет только после одобрения', 'Erkenden izin talebi (Urlaubsantrag) verir, onaydan sonra bilet alırım', 'Заздалегідь подаю заяву на відпустку (Urlaubsantrag) і купую квиток лише після схвалення'),
      T('Sadəcə gedirəm — məzuniyyət mənim haqqımdır', 'Einfach fahren – Urlaub steht mir ja zu', 'Just go – I am entitled to leave anyway', 'Просто уезжаю — отпуск мне ведь положен', 'Gider giderim – izin zaten hakkım', 'Просто їду — відпустка ж мені належить'),
    ],
    correct: 1,
    explain: T(
      'Məzuniyyəti işəgötürən təsdiqləyir; BUrlG § 7-yə görə o, sizin istəklərinizi nəzərə almalıdır, ciddi iş səbəbləri yoxdursa. Minimum: 6 günlük həftədə 24 iş günü (5 günlük həftədə 20 gün, § 3). Tam hüquq işin ilk 6 ayından sonra yaranır (§ 4). Özbaşına məzuniyyət işdən çıxarılmaya səbəb ola bilər.',
      'Urlaub genehmigt der Arbeitgeber; nach § 7 BUrlG muss er Ihre Wünsche berücksichtigen, wenn keine dringenden betrieblichen Gründe entgegenstehen. Mindestens 24 Werktage bei einer 6-Tage-Woche (20 Tage bei 5 Tagen, § 3); der volle Anspruch entsteht nach 6 Monaten (§ 4). Eigenmächtiger Urlaub kann zur Kündigung führen.',
      'Your employer approves leave; under § 7 BUrlG it must take your wishes into account unless urgent operational reasons prevent it. At least 24 working days on a 6-day week (20 days on a 5-day week, § 3); the full entitlement starts after 6 months (§ 4). Taking leave without approval can get you dismissed.',
      'Отпуск утверждает работодатель; по § 7 BUrlG он должен учитывать ваши пожелания, если этому не мешают срочные производственные причины. Минимум 24 рабочих дня при 6-дневке (20 дней при 5-дневке, § 3); полное право — через 6 месяцев (§ 4). Самовольный отпуск может стоить работы.',
      'İzni işveren onaylar; BUrlG § 7’ye göre acil işletme gerekçeleri yoksa isteklerinizi dikkate almalıdır. 6 günlük haftada en az 24 iş günü (5 günlükte 20 gün, § 3); tam hak 6 ay sonra doğar (§ 4). İzinsiz izne çıkmak işten çıkarılmaya yol açabilir.',
      'Відпустку затверджує роботодавець; за § 7 BUrlG він має враховувати ваші побажання, якщо цьому не заважають нагальні виробничі причини. Мінімум 24 робочі дні при 6-денному тижні (20 днів при 5-денному, § 3); повне право — через 6 місяців (§ 4). Самовільна відпустка може коштувати роботи.',
    ),
    sources: ['burlg7', 'burlg3', 'burlg4'],
    glossary: [{ slug: 'urlaubsanspruch', label: 'Urlaubsanspruch' }],
  },
  {
    id: 'probation',
    topic: 'rights',
    kind: 'law',
    q: T(
      'Sınaq müddəti (Probezeit) nə deməkdir?',
      'Was bedeutet die Probezeit?',
      'What does the probation period (Probezeit) mean?',
      'Что означает испытательный срок (Probezeit)?',
      'Deneme süresi (Probezeit) ne demektir?',
      'Що означає випробувальний термін (Probezeit)?',
    ),
    options: [
      T('Ən çoxu 6 ay; hər iki tərəf 2 həftəlik xəbərdarlıqla müqaviləni poza bilər; maaş, sığorta və fasilələr adi qaydada', 'Höchstens 6 Monate; beide Seiten können mit 2 Wochen Frist kündigen; Lohn, Versicherung und Pausen gelten normal', 'At most 6 months; both sides can give notice with 2 weeks’ notice; pay, insurance and breaks apply as normal', 'Максимум 6 месяцев; обе стороны могут расторгнуть договор с уведомлением за 2 недели; зарплата, страховка и перерывы как обычно', 'En fazla 6 ay; iki taraf da 2 hafta önceden bildirerek feshedebilir; maaş, sigorta ve molalar normaldir', 'Щонайбільше 6 місяців; обидві сторони можуть розірвати договір з повідомленням за 2 тижні; зарплата, страхування й перерви як завжди'),
      T('Maaş tam ödənilmir', 'Der Lohn wird nicht voll bezahlt', 'You are not paid in full', 'Зарплату платят не полностью', 'Maaş tam ödenmez', 'Зарплату платять не повністю'),
      T('İstənilən vaxt heç bir müddətsiz işdən çıxarıla bilərsiniz', 'Man kann Sie jederzeit ohne jede Frist entlassen', 'You can be dismissed at any time without any notice', 'Вас могут уволить в любой момент без всякого срока', 'Her an hiçbir süre olmadan işten çıkarılabilirsiniz', 'Вас можуть звільнити будь-коли без жодного терміну'),
    ],
    correct: 0,
    explain: T(
      'BGB § 622 (3): razılaşdırılmış sınaq müddətində, ən çoxu 6 ay, xəbərdarlıq müddəti 2 həftədir. Sınaq müddəti «yarımçıq» iş deyil — müqavilədəki maaş və bütün qanuni hüquqlar qüvvədədir.',
      '§ 622 Abs. 3 BGB: In einer vereinbarten Probezeit von höchstens 6 Monaten beträgt die Kündigungsfrist 2 Wochen. Die Probezeit ist kein „halbes“ Arbeitsverhältnis – Lohn laut Vertrag und alle gesetzlichen Rechte gelten.',
      '§ 622 (3) BGB: during an agreed probation period of at most 6 months the notice period is 2 weeks. Probation is not a “half” job – the contractual pay and all statutory rights apply.',
      '§ 622 абз. 3 BGB: в согласованный испытательный срок (максимум 6 месяцев) срок уведомления — 2 недели. Испытательный срок — не «половинчатая» работа: действуют зарплата по договору и все права по закону.',
      'BGB § 622 (3): En fazla 6 aylık kararlaştırılmış deneme süresinde fesih bildirim süresi 2 haftadır. Deneme süresi “yarım” iş değildir – sözleşmedeki maaş ve tüm yasal haklar geçerlidir.',
      '§ 622 абз. 3 BGB: в узгоджений випробувальний термін (щонайбільше 6 місяців) строк повідомлення — 2 тижні. Випробувальний термін — не «половинчаста» робота: діють зарплата за договором і всі права за законом.',
    ),
    sources: ['bgb622'],
    glossary: [{ slug: 'probezeit', label: 'Probezeit' }],
  },
  {
    id: 'works-council',
    topic: 'rights',
    kind: 'law',
    q: T(
      'Şirkətdə «Betriebsrat» var. Bu nədir?',
      'In der Firma gibt es einen Betriebsrat. Was ist das?',
      'The company has a Betriebsrat. What is it?',
      'В фирме есть Betriebsrat. Что это?',
      'Şirkette bir Betriebsrat var. Bu nedir?',
      'У фірмі є Betriebsrat. Що це?',
    ),
    options: [
      T('Sizi yoxlayan rəhbərlik şöbəsi', 'Eine Abteilung der Geschäftsführung, die Sie kontrolliert', 'A management department that checks on you', 'Отдел руководства, который вас контролирует', 'Sizi denetleyen bir yönetim birimi', 'Відділ керівництва, який вас контролює'),
      T('Seçilmiş işçi nümayəndələri — problemlə onlara məxfi müraciət edə bilərsiniz', 'Gewählte Vertretung der Beschäftigten – Sie können sich vertraulich an sie wenden', 'Elected representatives of the employees – you can turn to them in confidence', 'Выборные представители работников — к ним можно конфиденциально обратиться', 'Seçilmiş çalışan temsilcileri – onlara gizlilik içinde başvurabilirsiniz', 'Обрані представники працівників — до них можна звернутися конфіденційно'),
      T('Ödənişli həmkarlar ittifaqı haqqı', 'Ein kostenpflichtiger Gewerkschaftsbeitrag', 'A paid trade-union fee', 'Платный профсоюзный взнос', 'Ücretli bir sendika aidatı', 'Платний профспілковий внесок'),
    ],
    correct: 1,
    explain: T(
      'Betriebsrat — işçilərin seçdiyi nümayəndəlikdir (BetrVG § 1: ən azı 5 daimi işçisi olan müəssisələrdə seçilə bilər). İş vaxtı, növbə planı, işdən çıxarılma kimi məsələlərdə iştirak hüququ var. Ona müraciət etmək pulsuzdur və həmkarlar ittifaqı üzvlüyü tələb etmir.',
      'Der Betriebsrat ist die gewählte Vertretung der Beschäftigten (§ 1 BetrVG: wählbar in Betrieben mit mindestens 5 ständigen Beschäftigten). Er redet bei Arbeitszeit, Schichtplänen oder Kündigungen mit. Der Weg zu ihm ist kostenlos und setzt keine Gewerkschaftsmitgliedschaft voraus.',
      'The works council is the elected representation of the employees (§ 1 BetrVG: can be elected in establishments with at least 5 permanent employees). It has a say on working time, shift plans and dismissals. Going to it is free and needs no union membership.',
      'Betriebsrat — выборное представительство работников (§ 1 BetrVG: избирается на предприятиях минимум с 5 постоянными работниками). Он участвует в решениях о рабочем времени, графиках смен, увольнениях. Обращение бесплатное, членство в профсоюзе не нужно.',
      'Betriebsrat çalışanların seçilmiş temsilciliğidir (BetrVG § 1: en az 5 daimi çalışanı olan işletmelerde seçilebilir). Çalışma süresi, vardiya planı ve işten çıkarmada söz hakkı vardır. Ona başvurmak ücretsizdir, sendika üyeliği gerekmez.',
      'Betriebsrat — обране представництво працівників (§ 1 BetrVG: обирається на підприємствах щонайменше з 5 постійними працівниками). Він бере участь у рішеннях про робочий час, графіки змін, звільнення. Звернення безкоштовне, членство в профспілці не потрібне.',
    ),
    sources: ['betrvg1'],
    glossary: [{ slug: 'betriebsrat', label: 'Betriebsrat' }],
  },
  {
    id: 'ppe',
    topic: 'safety',
    kind: 'law',
    q: T(
      'Tikintidə təhlükəsizlik ayaqqabısı sıxır, dəbilqə istidir. Nə edirsiniz?',
      'Auf der Baustelle drücken die Sicherheitsschuhe und der Helm ist heiß. Was tun Sie?',
      'On the building site the safety shoes pinch and the helmet is hot. What do you do?',
      'На стройке жмут защитные ботинки, а в каске жарко. Что вы делаете?',
      'Şantiyede iş ayakkabıları sıkıyor, baret sıcak. Ne yaparsınız?',
      'На будові тиснуть захисні черевики, а в касці спекотно. Що ви робите?',
    ),
    options: [
      T('Qısa işlərdə onlarsız işləyirəm', 'Bei kurzen Arbeiten arbeite ich ohne', 'For short jobs I work without them', 'На коротких работах работаю без них', 'Kısa işlerde onlarsız çalışırım', 'На коротких роботах працюю без них'),
      T('Özüm başqasını alır, pulunu maaşdan çıxmalarını xahiş edirəm', 'Ich kaufe selbst andere und lasse es vom Lohn abziehen', 'I buy others myself and have it deducted from my pay', 'Покупаю другие сам, пусть вычтут из зарплаты', 'Kendim başkalarını alır, maaşımdan kesilmesini isterim', 'Купую інші сам, хай вирахують із зарплати'),
      T('Qoruyucu vasitələri yenə taxır, rəhbərə başqa ölçü lazım olduğunu deyirəm — işəgötürən onları pulsuz verir', 'Ich trage die PSA trotzdem und sage dem Vorgesetzten, dass ich eine andere Größe brauche – der Arbeitgeber stellt sie kostenlos', 'I wear the PPE anyway and tell my supervisor I need another size – the employer provides it free of charge', 'Всё равно ношу СИЗ и говорю руководителю, что нужен другой размер — работодатель выдаёт их бесплатно', 'KKD’yi yine de takar, amirime başka beden gerektiğini söylerim – işveren bunları ücretsiz verir', 'Усе одно ношу ЗІЗ і кажу керівнику, що потрібен інший розмір — роботодавець видає їх безкоштовно'),
    ],
    correct: 2,
    explain: T(
      'ArbSchG § 15: işçilər verilən fərdi qoruyucu vasitələrdən (PSA) təyinatı üzrə istifadə etməlidirlər. § 3 (3): iş təhlükəsizliyi tədbirlərinin xərci işçilərin üzərinə qoyula bilməz. Ölçü uyğun deyilsə, dərhal deyin.',
      '§ 15 ArbSchG: Beschäftigte müssen die zur Verfügung gestellte persönliche Schutzausrüstung (PSA) bestimmungsgemäß benutzen. § 3 Abs. 3: Kosten des Arbeitsschutzes darf der Arbeitgeber nicht den Beschäftigten auferlegen. Passt etwas nicht, sofort melden.',
      '§ 15 ArbSchG: employees must use the personal protective equipment (PSA/PPE) they are given as intended. § 3 (3): the employer may not pass the cost of safety measures on to employees. If something doesn’t fit, say so at once.',
      '§ 15 ArbSchG: работники обязаны использовать выданные средства индивидуальной защиты (PSA) по назначению. § 3 абз. 3: расходы на охрану труда нельзя перекладывать на работников. Если что-то не подходит — сразу скажите.',
      'ArbSchG § 15: Çalışanlar verilen kişisel koruyucu donanımı (PSA) amacına uygun kullanmak zorundadır. § 3 (3): İş güvenliği masrafları çalışanlara yüklenemez. Bir şey uymuyorsa hemen söyleyin.',
      '§ 15 ArbSchG: працівники мусять використовувати видані засоби індивідуального захисту (PSA) за призначенням. § 3 абз. 3: витрати на охорону праці не можна перекладати на працівників. Якщо щось не підходить — одразу скажіть.',
    ),
    sources: ['arbschg15', 'arbschg3'],
  },
  {
    id: 'small-injury',
    topic: 'safety',
    kind: 'law',
    q: T(
      'İşdə əlinizi yüngülcə kəsdiniz. Nə edirsiniz?',
      'Sie schneiden sich bei der Arbeit leicht in die Hand. Was tun Sie?',
      'You cut your hand slightly at work. What do you do?',
      'Вы слегка порезали руку на работе. Что вы делаете?',
      'İşte elinizi hafifçe kestiniz. Ne yaparsınız?',
      'Ви трохи порізали руку на роботі. Що ви робите?',
    ),
    options: [
      T('Bildirirəm və ilk yardım jurnalına (Verbandbuch) yazdırıram', 'Ich melde es und lasse es ins Verbandbuch eintragen', 'I report it and have it entered in the first-aid log (Verbandbuch)', 'Сообщаю и прошу записать в журнал первой помощи (Verbandbuch)', 'Bildirir ve ilk yardım defterine (Verbandbuch) yazdırırım', 'Повідомляю й прошу записати в журнал першої допомоги (Verbandbuch)'),
      T('Gizlədirəm — problem yaratmaq istəmirəm', 'Ich verstecke es – ich will keinen Ärger', 'I hide it – I don’t want trouble', 'Скрываю — не хочу проблем', 'Saklarım – sorun çıksın istemem', 'Приховую — не хочу проблем'),
      T('Heç nə demədən evə gedirəm', 'Ich gehe ohne Bescheid nach Hause', 'I go home without telling anyone', 'Ухожу домой, никому не сказав', 'Kimseye söylemeden eve giderim', 'Іду додому, нікому не сказавши'),
    ],
    correct: 0,
    explain: T(
      'Hər ilk yardım qeyd olunmalıdır (DGUV Vorschrift 1, § 24). Kiçik yara sonradan ağırlaşarsa, qeyd iş qəzası kimi qanuni qəza sığortasından ödəniş üçün sübutdur.',
      'Jede Erste-Hilfe-Leistung muss dokumentiert werden (DGUV Vorschrift 1, § 24). Wird aus der kleinen Wunde später mehr, ist der Eintrag der Nachweis für einen Arbeitsunfall und die gesetzliche Unfallversicherung.',
      'Every first-aid treatment must be documented (DGUV Vorschrift 1, § 24). If the small wound gets worse later, the entry is your proof of a work accident for the statutory accident insurance.',
      'Каждый случай первой помощи нужно документировать (DGUV Vorschrift 1, § 24). Если небольшая рана потом осложнится, запись — доказательство несчастного случая на работе для обязательного страхования.',
      'Her ilk yardım kayda geçirilmelidir (DGUV Vorschrift 1, § 24). Küçük yara sonra kötüleşirse kayıt, yasal kaza sigortası için iş kazasının kanıtıdır.',
      'Кожен випадок першої допомоги треба документувати (DGUV Vorschrift 1, § 24). Якщо невелика рана згодом ускладниться, запис — доказ нещасного випадку на роботі для обов’язкового страхування.',
    ),
    sources: ['dguv1'],
    glossary: [{ slug: 'arbeitsunfall', label: 'Arbeitsunfall' }],
  },
  {
    id: 'waste-at-work',
    topic: 'culture',
    kind: 'law',
    q: T(
      'Fasilə otağında kağız, qablaşdırma, qalıq və bio zibil qabları var. Boş qatıq qabı hara?',
      'Im Pausenraum gibt es Tonnen für Papier, Verpackung, Restmüll und Bio. Wohin mit dem leeren Joghurtbecher?',
      'The break room has bins for paper, packaging, residual waste and organic. Where does the empty yoghurt pot go?',
      'В комнате отдыха есть баки для бумаги, упаковки, остаточного мусора и био. Куда пустой стаканчик от йогурта?',
      'Mola odasında kâğıt, ambalaj, karışık atık ve bio kutuları var. Boş yoğurt kabı nereye?',
      'У кімнаті відпочинку є баки для паперу, упаковки, залишкового сміття й біо. Куди порожній стаканчик з-під йогурту?',
    ),
    options: [
      T('Qalıq zibilə', 'In den Restmüll', 'Residual waste', 'В остаточный мусор', 'Karışık atığa', 'У залишкове сміття'),
      T('Qablaşdırmaya (Gelber Sack / Wertstoff) — qaşıqla təmizlənmiş, yumağa ehtiyac yoxdur', 'In die Verpackung (Gelber Sack / Wertstoff) – löffelrein, nicht ausspülen', 'Packaging (yellow bag / Wertstoff) – scraped clean, no need to rinse', 'В упаковку (Gelber Sack / Wertstoff) — вычищенным ложкой, мыть не нужно', 'Ambalaja (Gelber Sack / Wertstoff) – kaşıkla sıyrılmış, yıkamaya gerek yok', 'В упаковку (Gelber Sack / Wertstoff) — вичищеним ложкою, мити не треба'),
      T('Kağıza', 'Ins Papier', 'Paper', 'В бумагу', 'Kâğıda', 'У папір'),
    ],
    correct: 1,
    explain: T(
      'Almaniyada iş yerində də zibil ayrılır — şirkətlər üçün bu, Gewerbeabfallverordnung (§ 3) ilə tələb olunur. Plastik qab qablaşdırmadır. Daha çox məşq: /waste-sorting.',
      'Auch am Arbeitsplatz wird getrennt – für Betriebe schreibt das die Gewerbeabfallverordnung (§ 3) vor. Der Plastikbecher ist Verpackung. Mehr üben: /waste-sorting.',
      'Waste is separated at work too – for businesses the Commercial Waste Ordinance (GewAbfV § 3) requires it. The plastic pot is packaging. More practice: /waste-sorting.',
      'На работе мусор тоже сортируют — для предприятий этого требует Gewerbeabfallverordnung (§ 3). Пластиковый стаканчик — упаковка. Потренироваться: /waste-sorting.',
      'İş yerinde de atık ayrıştırılır – işletmeler için bunu Gewerbeabfallverordnung (§ 3) şart koşar. Plastik kap ambalajdır. Daha fazla pratik: /waste-sorting.',
      'На роботі сміття теж сортують — для підприємств цього вимагає Gewerbeabfallverordnung (§ 3). Пластиковий стаканчик — упаковка. Потренуватися: /waste-sorting.',
    ),
    sources: ['gewabfv3'],
  },
  {
    id: 'birthday',
    topic: 'culture',
    kind: 'custom',
    q: T(
      'Bu gün sizin ad gününüzdür. Bir çox alman komandasında adət nədir?',
      'Heute ist Ihr Geburtstag. Was ist in vielen deutschen Teams üblich?',
      'Today is your birthday. What is common in many German teams?',
      'Сегодня ваш день рождения. Что принято во многих немецких командах?',
      'Bugün doğum gününüz. Pek çok Alman ekibinde gelenek nedir?',
      'Сьогодні ваш день народження. Що прийнято в багатьох німецьких командах?',
    ),
    options: [
      T('Ad günü olan şəxs həmkarlar üçün tort və ya qəlyanaltı gətirir — məcburi deyil', 'Das Geburtstagskind bringt Kuchen oder Snacks für die Kollegen mit – Pflicht ist es nicht', 'The birthday person brings cake or snacks for colleagues – not compulsory', 'Именинник приносит коллегам торт или угощение — это не обязательно', 'Doğum günü olan kişi iş arkadaşlarına pasta ya da atıştırmalık getirir – zorunlu değil', 'Іменинник приносить колегам торт чи частування — це не обов’язково'),
      T('Həmkarlar sizə mütləq bahalı hədiyyə almalıdır', 'Die Kollegen müssen Ihnen ein teures Geschenk kaufen', 'Colleagues must buy you an expensive present', 'Коллеги обязаны купить вам дорогой подарок', 'İş arkadaşları size mutlaka pahalı bir hediye almalı', 'Колеги мусять купити вам дорогий подарунок'),
      T('Ad gününü işdə heç vaxt demək olmaz', 'Den Geburtstag sagt man bei der Arbeit nie', 'You never mention your birthday at work', 'О дне рождения на работе никогда не говорят', 'İş yerinde doğum günü asla söylenmez', 'Про день народження на роботі ніколи не кажуть'),
    ],
    correct: 0,
    explain: T(
      'Bir çox komandada ad günü olan şəxs özü nə isə gətirir («Ich habe Kuchen mitgebracht!»). Bəzən həmkarlar kiçik hədiyyə üçün pul yığır — iştirak könüllüdür. Bu adətdir, qanun deyil.',
      'In vielen Teams gibt das Geburtstagskind selbst etwas aus („Ich habe Kuchen mitgebracht!“). Manchmal sammeln Kollegen für ein kleines Geschenk – mitmachen ist freiwillig. Brauch, kein Gesetz.',
      'In many teams the birthday person treats the others (“Ich habe Kuchen mitgebracht!”). Sometimes colleagues collect money for a small present – joining in is voluntary. Custom, not law.',
      'Во многих командах именинник сам угощает («Ich habe Kuchen mitgebracht!»). Иногда коллеги скидываются на небольшой подарок — участие добровольное. Обычай, а не закон.',
      'Pek çok ekipte doğum günü olan kişi ikram eder (“Ich habe Kuchen mitgebracht!”). Bazen iş arkadaşları küçük bir hediye için para toplar – katılmak gönüllüdür. Gelenek, yasa değil.',
      'У багатьох командах іменинник сам пригощає («Ich habe Kuchen mitgebracht!»). Іноді колеги збирають на невеликий подарунок — участь добровільна. Звичай, а не закон.',
    ),
    sources: [],
  },
  {
    id: 'small-talk',
    topic: 'culture',
    kind: 'custom',
    q: T(
      'Qəhvə fasiləsində yeni həmkarlarla hansı mövzular yaxşıdır?',
      'Welche Themen passen in der Kaffeepause mit neuen Kollegen?',
      'Which topics suit a coffee break with new colleagues?',
      'Какие темы подходят для кофе-паузы с новыми коллегами?',
      'Yeni iş arkadaşlarıyla kahve molasında hangi konular uygundur?',
      'Які теми пасують для кава-паузи з новими колегами?',
    ),
    options: [
      T('Maaş, din və siyasət', 'Gehalt, Religion und Politik', 'Salary, religion and politics', 'Зарплата, религия и политика', 'Maaş, din ve siyaset', 'Зарплата, релігія й політика'),
      T('Hava, həftəsonu, futbol, yemək, səyahət', 'Wetter, Wochenende, Fußball, Essen, Reisen', 'Weather, weekend, football, food, travel', 'Погода, выходные, футбол, еда, путешествия', 'Hava, hafta sonu, futbol, yemek, seyahat', 'Погода, вихідні, футбол, їжа, подорожі'),
      T('Həmkarın yaşı və çəkisi', 'Alter und Gewicht der Kollegin', 'A colleague’s age and weight', 'Возраст и вес коллеги', 'İş arkadaşının yaşı ve kilosu', 'Вік і вага колеги'),
    ],
    correct: 1,
    explain: T(
      'Yüngül mövzular buzu əridir. Maaş haqqında danışmaq qadağan deyil, amma çoxları onu şəxsi sayır; din və siyasəti yaxşı tanış olmayanda ehtiyatla açın. Bu adətdir.',
      'Leichte Themen brechen das Eis. Über Gehalt zu sprechen ist nicht verboten, viele finden es aber privat; Religion und Politik lieber erst, wenn man sich besser kennt. Das ist Brauch.',
      'Light topics break the ice. Talking about pay is not forbidden, but many people consider it private; save religion and politics for when you know each other better. This is custom.',
      'Лёгкие темы помогают познакомиться. Говорить о зарплате не запрещено, но многие считают это личным; религию и политику лучше обсуждать, когда узнаете друг друга. Это обычай.',
      'Hafif konular buzları eritir. Maaştan konuşmak yasak değil ama çoğu kişi bunu özel sayar; din ve siyaseti daha iyi tanışınca açın. Bu gelenektir.',
      'Легкі теми допомагають познайомитися. Говорити про зарплату не заборонено, але багато хто вважає це особистим; релігію й політику краще обговорювати, коли краще пізнаєте одне одного. Це звичай.',
    ),
    sources: [],
  },
  {
    id: 'direct-feedback',
    topic: 'culture',
    kind: 'custom',
    q: T(
      'Rəhbər deyir: «Das ist falsch. Mach es bitte so.» Bu nə deməkdir?',
      'Die Vorgesetzte sagt: „Das ist falsch. Mach es bitte so.“ Wie ist das gemeint?',
      'Your supervisor says: “Das ist falsch. Mach es bitte so.” What does it mean?',
      'Руководитель говорит: «Das ist falsch. Mach es bitte so». Что это значит?',
      'Amiriniz diyor ki: “Das ist falsch. Mach es bitte so.” Ne demek istiyor?',
      'Керівниця каже: «Das ist falsch. Mach es bitte so». Що це означає?',
    ),
    options: [
      T('O məni sevmir — inciyirəm', 'Sie mag mich nicht – ich bin beleidigt', 'She doesn’t like me – I feel offended', 'Она меня не любит — я обижаюсь', 'Beni sevmiyor – alınırım', 'Вона мене не любить — я ображаюся'),
      T('Hamının qarşısında mübahisə edirəm', 'Ich diskutiere vor allen dagegen', 'I argue against it in front of everyone', 'Спорю при всех', 'Herkesin önünde tartışırım', 'Сперечаюся при всіх'),
      T('Söhbət şəxsiyyətdən yox, işdən gedir: «Okay, danke» deyirəm, aydın deyilsə soruşuram', 'Es geht um die Sache, nicht um die Person: „Okay, danke“ – und nachfragen, wenn etwas unklar ist', 'It is about the task, not the person: “Okay, danke” – and ask if something is unclear', 'Речь о деле, а не о человеке: «Okay, danke» — и уточняю, если неясно', 'Mesele kişi değil iş: “Okay, danke” derim, belirsizse sorarım', 'Ідеться про справу, а не про людину: «Okay, danke» — і перепитую, якщо незрозуміло'),
    ],
    correct: 2,
    explain: T(
      'Almaniyada rəy çox vaxt birbaşa və qısa olur, xüsusilə tikintidə və mətbəxdə. Bu, kobudluq yox, aydınlıqdır. Siz də sual verə və ya fikrinizi sakitcə, təklikdə deyə bilərsiniz.',
      'Feedback ist in Deutschland oft direkt und knapp, besonders auf Baustellen und in Küchen. Das ist Klarheit, keine Unhöflichkeit. Sie dürfen nachfragen oder Ihre Sicht ruhig unter vier Augen sagen.',
      'Feedback in Germany is often direct and short, especially on building sites and in kitchens. It means clarity, not rudeness. You may ask questions or calmly give your view in private.',
      'Обратная связь в Германии часто прямая и короткая, особенно на стройке и на кухне. Это ясность, а не грубость. Можно уточнить или спокойно высказать своё мнение с глазу на глаз.',
      'Almanya’da geri bildirim çoğu zaman doğrudan ve kısadır, özellikle şantiyede ve mutfakta. Bu kabalık değil, açıklıktır. Soru sorabilir ya da görüşünüzü sakince baş başa söyleyebilirsiniz.',
      'Зворотний зв’язок у Німеччині часто прямий і короткий, особливо на будові й на кухні. Це ясність, а не грубість. Можна перепитати або спокійно висловити свою думку віч-на-віч.',
    ),
    sources: [],
  },
  {
    id: 'meeting',
    topic: 'time',
    kind: 'custom',
    q: T(
      'Komanda iclası saat 9:00-dadır. Nə vaxt orada olursunuz?',
      'Die Teambesprechung ist um 9:00 Uhr. Wann sind Sie da?',
      'The team meeting is at 9:00. When are you there?',
      'Собрание команды в 9:00. Когда вы там?',
      'Ekip toplantısı 9:00’da. Ne zaman orada olursunuz?',
      'Нарада команди о 9:00. Коли ви там?',
    ),
    options: [
      T('9:15 — «akademik dörddəbir» normaldır', 'Um 9:15 – das „akademische Viertel“ ist normal', 'At 9:15 – the “academic quarter” is normal', 'В 9:15 — «академическая четверть» в порядке вещей', '9:15’te – “akademik çeyrek” normaldir', 'О 9:15 — «академічна чверть» нормальна'),
      T('Bir-iki dəqiqə əvvəl, telefon səssiz rejimdə', 'Ein, zwei Minuten vorher, Handy auf lautlos', 'A minute or two early, phone on silent', 'За минуту-две, телефон на беззвучном', 'Bir iki dakika önce, telefon sessizde', 'За хвилину-дві, телефон на беззвучному'),
      T('Qəhvəmi bitirəndə', 'Wenn ich meinen Kaffee ausgetrunken habe', 'When I have finished my coffee', 'Когда допью кофе', 'Kahvemi bitirince', 'Коли доп’ю каву'),
    ],
    correct: 1,
    explain: T(
      'İclaslar adətən vaxtında başlayır. «Akademik dörddəbir» yalnız bəzi universitet mühazirələrində olur. Gecikirsinizsə, qısa yazın.',
      'Besprechungen beginnen meist pünktlich. Das „akademische Viertel“ gibt es nur bei manchen Vorlesungen an der Uni. Wenn Sie sich verspäten, kurz Bescheid geben.',
      'Meetings usually start on time. The “academic quarter” exists only for some university lectures. If you will be late, send a short message.',
      'Собрания обычно начинаются вовремя. «Академическая четверть» бывает только на некоторых лекциях в университете. Если опаздываете — коротко предупредите.',
      'Toplantılar genellikle zamanında başlar. “Akademik çeyrek” sadece bazı üniversite derslerinde vardır. Gecikecekseniz kısaca haber verin.',
      'Наради зазвичай починаються вчасно. «Академічна чверть» буває лише на деяких лекціях в університеті. Якщо запізнюєтеся — коротко попередьте.',
    ),
    sources: [],
  },
  {
    id: 'phone',
    topic: 'safety',
    kind: 'law',
    q: T(
      'İş vaxtı şəxsi telefondan istifadə etmək olarmı?',
      'Darf man das private Handy während der Arbeit benutzen?',
      'May you use your private phone during work?',
      'Можно ли пользоваться личным телефоном во время работы?',
      'Çalışırken kişisel telefon kullanılabilir mi?',
      'Чи можна користуватися особистим телефоном під час роботи?',
    ),
    options: [
      T('Şirkət qaydasına əməl edirəm — çox vaxt yalnız fasilədə; maşın, xəstə və ya sükan arxasında heç vaxt', 'Ich halte mich an die Firmenregel – oft nur in der Pause; an Maschinen, bei Patienten oder am Steuer nie', 'I follow the company rule – often only on breaks; never at machines, with patients or behind the wheel', 'Соблюдаю правило фирмы — часто только в перерыв; у станков, с пациентами или за рулём — никогда', 'Şirket kuralına uyarım – çoğu zaman sadece molada; makine başında, hastayla ya da direksiyonda asla', 'Дотримуюся правила фірми — часто лише в перерву; біля верстатів, з пацієнтами чи за кермом — ніколи'),
      T('Həmişə olar, bu mənim telefonumdur', 'Immer – es ist mein Handy', 'Always – it is my phone', 'Всегда — это мой телефон', 'Her zaman – benim telefonum', 'Завжди — це мій телефон'),
      T('İşəgötürən bu barədə qayda qoya bilməz', 'Der Arbeitgeber darf dazu keine Regeln machen', 'The employer may not make rules about it', 'Работодатель не вправе это регулировать', 'İşveren bu konuda kural koyamaz', 'Роботодавець не має права це регулювати'),
    ],
    correct: 0,
    explain: T(
      'İşəgötürən iş qaydası haqqında göstəriş verə bilər (GewO § 106), şəxsi telefon da daxil olmaqla. Sükan arxasında telefonu əldə tutmaq StVO § 23 ilə qadağandır. Təcili ailə zəngi gözləyirsinizsə, rəhbərə əvvəlcədən deyin.',
      'Der Arbeitgeber darf Regeln zur Ordnung im Betrieb aufstellen (§ 106 GewO), auch zum privaten Handy. Am Steuer ist das Handy in der Hand nach § 23 StVO verboten. Erwarten Sie einen dringenden Familienanruf, sagen Sie es vorher.',
      'Your employer may set rules on conduct at work (§ 106 GewO), including private phones. Holding a phone while driving is banned by § 23 StVO. If you expect an urgent family call, say so beforehand.',
      'Работодатель вправе устанавливать правила поведения на работе (§ 106 GewO), в том числе о личном телефоне. Держать телефон в руке за рулём запрещено § 23 StVO. Ждёте срочного звонка от семьи — предупредите заранее.',
      'İşveren iş yerindeki düzen için kural koyabilir (GewO § 106), kişisel telefon dahil. Direksiyonda telefonu elde tutmak StVO § 23 ile yasaktır. Acil bir aile araması bekliyorsanız önceden söyleyin.',
      'Роботодавець може встановлювати правила поведінки на роботі (§ 106 GewO), зокрема щодо особистого телефону. Тримати телефон у руці за кермом заборонено § 23 StVO. Чекаєте термінового дзвінка від родини — попередьте заздалегідь.',
    ),
    sources: ['gewo106', 'stvo23'],
  },
  {
    id: 'faith',
    topic: 'faith',
    kind: 'law',
    q: T(
      'Gün ərzində namaz qılmaq və ya Ramazan bayramında istirahət etmək istəyirsiniz. Hansı doğrudur?',
      'Sie möchten während des Tages beten oder an Ramadan-Bayram freihaben. Was stimmt?',
      'You would like to pray during the day or be off for Eid. What is true?',
      'Вы хотите молиться в течение дня или взять выходной на Рамазан-байрам. Что верно?',
      'Gün içinde namaz kılmak ya da Ramazan Bayramı’nda izinli olmak istiyorsunuz. Hangisi doğru?',
      'Ви хочете молитися протягом дня або мати вихідний на Рамадан-байрам. Що правильно?',
    ),
    options: [
      T('İşəgötürən mütləq ödənişli istirahət günü verməlidir', 'Der Arbeitgeber muss einen bezahlten freien Tag geben', 'The employer must give a paid day off', 'Работодатель обязан дать оплачиваемый выходной', 'İşveren ücretli izin günü vermek zorundadır', 'Роботодавець зобов’язаний дати оплачуваний вихідний'),
      T('Erkən danışın: namaz fasilədə və ya razılaşdırılmış çevik vaxtda; bayram üçün məzuniyyət və ya razılıqla ödənişsiz gün — ümumi qanuni ödənişli istirahət hüququ yoxdur', 'Früh sprechen: Gebet in der Pause oder mit vereinbarter flexibler Zeit; für das Fest Urlaub oder nach Absprache unbezahlt frei – einen allgemeinen Anspruch auf bezahlte Freistellung gibt es nicht', 'Talk early: pray during breaks or with agreed flexible time; for the festival take leave or, by agreement, unpaid time off – there is no general right to paid time off', 'Поговорите заранее: молитва в перерыв или в согласованное гибкое время; на праздник — отпуск или по договорённости неоплачиваемый выходной; общего права на оплачиваемое освобождение нет', 'Erken konuşun: namaz molada ya da kararlaştırılan esnek sürede; bayram için yıllık izin ya da anlaşmayla ücretsiz izin – genel bir ücretli izin hakkı yoktur', 'Поговоріть заздалегідь: молитва в перерву або в узгоджений гнучкий час; на свято — відпустка або за домовленістю неоплачуваний вихідний; загального права на оплачуване звільнення немає'),
      T('Din işdə qadağandır, soruşmaq olmaz', 'Religion ist bei der Arbeit verboten, fragen darf man nicht', 'Religion is forbidden at work, you may not ask', 'Религия на работе запрещена, спрашивать нельзя', 'Din iş yerinde yasaktır, sorulamaz', 'Релігія на роботі заборонена, питати не можна'),
    ],
    correct: 1,
    explain: T(
      'Din azadlığı qorunur, soruşmaq tamamilə normaldır. Ramazan və Qurban bayramı Almaniyada rəsmi bayram deyil; ödənişli istirahət üçün ümumi qanuni hüquq yoxdur. Məzuniyyət istəyərkən işəgötürən istəyinizi nəzərə almalıdır (BUrlG § 7). Bəzi torpaqların bayram qanunlarında dini bayramlar üçün xüsusi qaydalar var — HR-dan soruşun. Bir çox işəgötürən növbələri dəyişməyə razı olur.',
      'Religionsfreiheit ist geschützt, Fragen ist völlig normal. Ramadan- und Opferfest sind in Deutschland keine gesetzlichen Feiertage; einen allgemeinen gesetzlichen Anspruch auf bezahlte Freistellung gibt es nicht. Beim Urlaubswunsch muss der Arbeitgeber Ihre Wünsche berücksichtigen (§ 7 BUrlG). Einige Landes-Feiertagsgesetze haben Sonderregeln für religiöse Feiertage – fragen Sie die Personalabteilung. Viele Arbeitgeber tauschen gern Schichten.',
      'Freedom of religion is protected and asking is completely normal. Eid al-Fitr and Eid al-Adha are not public holidays in Germany; there is no general legal right to paid time off. When you ask for leave, the employer must take your wishes into account (§ 7 BUrlG). Some federal states’ holiday laws have special rules for religious holidays – ask HR. Many employers are happy to swap shifts.',
      'Свобода вероисповедания защищена, спрашивать совершенно нормально. Рамазан- и Курбан-байрам в Германии не государственные праздники; общего законного права на оплачиваемое освобождение нет. При заявлении на отпуск работодатель должен учитывать ваши пожелания (§ 7 BUrlG). В законах о праздниках некоторых земель есть особые правила для религиозных праздников — спросите отдел кадров. Многие работодатели охотно меняют смены.',
      'Din özgürlüğü korunur, sormak tamamen normaldir. Ramazan ve Kurban Bayramı Almanya’da resmî tatil değildir; ücretli izin için genel bir yasal hak yoktur. İzin talebinizde işveren isteklerinizi dikkate almalıdır (BUrlG § 7). Bazı eyaletlerin bayram yasalarında dinî bayramlar için özel kurallar vardır – insan kaynaklarına sorun. Pek çok işveren vardiya değişimine sıcak bakar.',
      'Свобода віросповідання захищена, питати цілком нормально. Рамадан- і Курбан-байрам у Німеччині не державні свята; загального законного права на оплачуване звільнення немає. Коли ви просите відпустку, роботодавець має враховувати ваші побажання (§ 7 BUrlG). У законах про свята деяких земель є особливі правила для релігійних свят — спитайте відділ кадрів. Багато роботодавців охоче міняють зміни.',
    ),
    sources: ['burlg7'],
  },
  {
    id: 'cash-in-hand',
    topic: 'legal',
    kind: 'law',
    q: T(
      'Tanış həftəsonu nağd pulla, «sənədsiz» iş təklif edir. Nə edirsiniz?',
      'Ein Bekannter bietet Wochenendarbeit gegen Bargeld an, „ohne Papiere“. Was tun Sie?',
      'An acquaintance offers weekend work for cash, “no paperwork”. What do you do?',
      'Знакомый предлагает работу на выходных за наличные, «без бумаг». Что вы делаете?',
      'Bir tanıdık hafta sonu nakit karşılığı, “belgesiz” iş teklif ediyor. Ne yaparsınız?',
      'Знайомий пропонує роботу на вихідних за готівку, «без папірців». Що ви робите?',
    ),
    options: [
      T('Kiçik məbləğdirsə, olar', 'Bei kleinen Beträgen ist das okay', 'Fine if the amounts are small', 'Если суммы небольшие — можно', 'Küçük miktarlarsa sorun yok', 'Якщо суми невеликі — можна'),
      T('Həftəsonudur, ona görə qaydalar keçmir', 'Am Wochenende gelten die Regeln nicht', 'Rules don’t apply at the weekend', 'В выходные правила не действуют', 'Hafta sonu kurallar geçerli değil', 'У вихідні правила не діють'),
      T('İmtina edirəm: qara iş qanunsuzdur — sığorta yoxdur, pensiya yoxdur, yaşayış icazəsinə risk var', 'Ich lehne ab: Schwarzarbeit ist illegal – keine Versicherung, keine Rente, Risiko für den Aufenthaltstitel', 'I refuse: undeclared work is illegal – no insurance, no pension, a risk for my residence permit', 'Отказываюсь: работа «вчёрную» незаконна — нет страховки, нет пенсии, риск для вида на жительство', 'Reddederim: kaçak çalışma yasa dışıdır – sigorta yok, emeklilik yok, oturum izni için risk', 'Відмовляюся: робота «в чорну» незаконна — немає страхування, немає пенсії, ризик для дозволу на проживання'),
    ],
    correct: 2,
    explain: T(
      'Sosial sığorta və vergi ödənilmədən iş Schwarzarbeit-dir (SchwarzArbG § 1). Qəzada sübutunuz olmur. Xaricilər yalnız yaşayış icazəsinin icazə verdiyi işi görə bilər (AufenthG § 4a) — icazəsiz əlavə iş icazənizi təhlükəyə ata bilər. Əlavə iş istəyirsinizsə, əvvəlcə Ausländerbehörde və işəgötürənlə dəqiqləşdirin.',
      'Arbeit ohne Sozialversicherung und Steuern ist Schwarzarbeit (§ 1 SchwarzArbG). Bei einem Unfall fehlt jeder Nachweis. Ausländer dürfen nur arbeiten, wie es der Aufenthaltstitel erlaubt (§ 4a AufenthG) – ein unerlaubter Nebenjob kann den Titel gefährden. Für einen Nebenjob vorher Ausländerbehörde und Arbeitgeber fragen.',
      'Work without social insurance and tax is Schwarzarbeit (§ 1 SchwarzArbG). After an accident you have no proof of anything. Foreign nationals may only work as their residence permit allows (§ 4a AufenthG) – an unauthorised side job can put your permit at risk. For a side job, ask the immigration office and your employer first.',
      'Работа без соцстрахования и налогов — Schwarzarbeit (§ 1 SchwarzArbG). При несчастном случае у вас нет никаких доказательств. Иностранцы могут работать только так, как разрешает вид на жительство (§ 4a AufenthG), — неразрешённая подработка может поставить его под угрозу. О подработке сначала спросите Ausländerbehörde и работодателя.',
      'Sosyal sigorta ve vergi olmadan çalışmak Schwarzarbeit’tır (SchwarzArbG § 1). Bir kazada hiçbir kanıtınız olmaz. Yabancılar yalnızca oturum izninin izin verdiği şekilde çalışabilir (AufenthG § 4a) – izinsiz ek iş izninizi tehlikeye atabilir. Ek iş için önce Ausländerbehörde’ye ve işverene sorun.',
      'Робота без соцстрахування й податків — Schwarzarbeit (§ 1 SchwarzArbG). У разі нещасного випадку у вас немає жодних доказів. Іноземці можуть працювати лише так, як дозволяє дозвіл на проживання (§ 4a AufenthG), — недозволена підробітка може поставити його під загрозу. Про підробіток спершу спитайте Ausländerbehörde і роботодавця.',
    ),
    sources: ['schwarzarbg1', 'aufenthg4a'],
    glossary: [{ slug: 'minijob', label: 'Minijob' }],
  },
  {
    id: 'reference-letter',
    topic: 'rights',
    kind: 'law',
    q: T(
      '2 ildən sonra işdən gedirsiniz. Nə tələb edə bilərsiniz?',
      'Sie verlassen die Firma nach 2 Jahren. Was können Sie verlangen?',
      'You are leaving the company after 2 years. What can you ask for?',
      'Вы уходите из фирмы через 2 года. Что вы можете потребовать?',
      '2 yıl sonra şirketten ayrılıyorsunuz. Ne talep edebilirsiniz?',
      'Ви йдете з фірми через 2 роки. Що ви можете вимагати?',
    ),
    options: [
      T('Heç nə — sadəcə gedirsiniz', 'Nichts – man geht einfach', 'Nothing – you just leave', 'Ничего — просто уходите', 'Hiçbir şey – öylece gidersiniz', 'Нічого — просто йдете'),
      T('Yazılı iş arayışı (Arbeitszeugnis); istəsəniz — iş keyfiyyəti və davranış haqqında «ixtisaslı» arayış', 'Ein schriftliches Arbeitszeugnis; auf Wunsch ein qualifiziertes mit Leistung und Verhalten', 'A written reference (Arbeitszeugnis); on request a “qualified” one covering performance and conduct', 'Письменную характеристику (Arbeitszeugnis); по желанию — «квалифицированную» с оценкой работы и поведения', 'Yazılı bir iş belgesi (Arbeitszeugnis); isterseniz performans ve davranışı içeren “nitelikli” belge', 'Письмову характеристику (Arbeitszeugnis); за бажанням — «кваліфіковану» з оцінкою роботи й поведінки'),
      T('Yalnız son maaş vərəqəsi', 'Nur die letzte Lohnabrechnung', 'Only the last payslip', 'Только последний расчётный лист', 'Sadece son maaş bordrosu', 'Лише останній розрахунковий лист'),
    ],
    correct: 1,
    explain: T(
      'GewO § 109: işdən gedəndə yazılı arayış hüququnuz var — ən azı işin növü və müddəti; istəsəniz iş keyfiyyəti və davranış da. Arayış aydın olmalı, gizli mənfi ifadələr olmamalıdır. Almaniyada növbəti iş üçün çox vacibdir.',
      '§ 109 GewO: Beim Ausscheiden haben Sie Anspruch auf ein schriftliches Zeugnis – mindestens Art und Dauer der Tätigkeit, auf Wunsch auch Leistung und Verhalten. Es muss klar formuliert sein und darf keine versteckten negativen Aussagen enthalten. Für die nächste Stelle in Deutschland sehr wichtig.',
      '§ 109 GewO: when you leave you are entitled to a written reference – at least type and duration of the work, on request also performance and conduct. It must be clear and may not contain hidden negative statements. Very important for your next job in Germany.',
      '§ 109 GewO: при уходе вы имеете право на письменную характеристику — минимум вид и срок работы, по желанию также оценку работы и поведения. Она должна быть ясной, без скрытых негативных формулировок. Очень важна для следующей работы в Германии.',
      'GewO § 109: Ayrılırken yazılı belge hakkınız vardır – en az işin türü ve süresi, isterseniz performans ve davranış da. Açık yazılmalı, gizli olumsuz ifadeler içermemelidir. Almanya’da bir sonraki iş için çok önemlidir.',
      '§ 109 GewO: при звільненні ви маєте право на письмову характеристику — щонайменше вид і тривалість роботи, за бажанням також оцінку роботи й поведінки. Вона має бути чіткою, без прихованих негативних формулювань. Дуже важлива для наступної роботи в Німеччині.',
    ),
    sources: ['gewo109'],
    glossary: [{ slug: 'arbeitszeugnis', label: 'Arbeitszeugnis' }],
  },
];

export const ETIQUETTE_TOTAL = ETIQUETTE_QUESTIONS.length;
/** Share of right answers that counts as "passed" (also the Germany Ready pass mark of 'workplace-etiquette'). */
export const ETIQUETTE_PASS_RATIO = 0.7;

export interface EtiquetteResult {
  correct: number;
  total: number;
  percent: number;
  passed: boolean;
  /** Ids of wrongly answered or unanswered questions, in quiz order. */
  mistakes: string[];
}

/** Grades the answers (question id → chosen option index) against `questions` (default: all). */
export const gradeEtiquette = (answers: Record<string, number>, questions: EtiquetteQuestion[] = ETIQUETTE_QUESTIONS): EtiquetteResult => {
  const mistakes = questions.filter((q) => answers[q.id] !== q.correct).map((q) => q.id);
  const total = questions.length;
  const correct = total - mistakes.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return { correct, total, percent, passed: total > 0 && correct / total >= ETIQUETTE_PASS_RATIO, mistakes };
};

export const etiquetteQuestion = (id: string) => ETIQUETTE_QUESTIONS.find((q) => q.id === id);

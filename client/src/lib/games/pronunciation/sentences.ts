/**
 * Sentences of the pronunciation trainer (/pronunciation) by level and topic. "Everyday" reuses the curated
 * phrases of the phrase of the day (components/world/phrases.ts; short ones A1, longer ones A2); the job
 * sentences are written for the professions we place (care, construction, drivers, hospitality, electricians)
 * and for appointments at offices, in the style of the starter vocabulary (server prisma/seed/germanVocabulary.ts).
 */
import { PHRASES } from '@/components/world/phrases';
import type { TxNoDe } from '@/lib/games/common';

export const SENTENCE_LEVELS = ['A1', 'A2', 'B1'] as const;
export type SentenceLevel = (typeof SENTENCE_LEVELS)[number];
export const SENTENCE_TOPICS = ['everyday', 'office', 'care', 'construction', 'driving', 'hospitality', 'electrical'] as const;
export type SentenceTopic = (typeof SENTENCE_TOPICS)[number];

export interface Sentence {
  id: string;
  level: SentenceLevel;
  topic: SentenceTopic;
  de: string;
  tx: TxNoDe;
}

type Row = [id: string, level: SentenceLevel, topic: SentenceTopic, de: string, az: string, en: string, ru: string, tr: string, uk: string];

// prettier-ignore
const ROWS: Row[] = [
  // offices and appointments
  ['office-termin', 'A2', 'office', 'Ich habe um zehn Uhr einen Termin.', 'Saat onda görüşüm (Termin) var.', 'I have an appointment at ten o’clock.', 'У меня назначена встреча на десять часов.', 'Saat onda randevum var.', 'У мене запис на десяту годину.'],
  ['office-anmelden', 'A2', 'office', 'Ich möchte meine Wohnung anmelden.', 'Mənzilimi qeydiyyatdan keçirmək istəyirəm.', 'I would like to register my flat.', 'Я хочу зарегистрироваться по месту жительства.', 'İkametimi kaydettirmek istiyorum.', 'Я хочу зареєструватися за місцем проживання.'],
  ['office-formular', 'A2', 'office', 'Können Sie mir bei dem Formular helfen?', 'Formada mənə kömək edə bilərsiniz?', 'Can you help me with the form?', 'Вы можете помочь мне с формуляром?', 'Formda bana yardım edebilir misiniz?', 'Ви можете допомогти мені з формуляром?'],
  ['office-unterlagen', 'B1', 'office', 'Welche Unterlagen muss ich noch mitbringen?', 'Daha hansı sənədləri gətirməliyəm?', 'Which documents do I still need to bring?', 'Какие документы мне ещё нужно принести?', 'Başka hangi belgeleri getirmem gerekiyor?', 'Які документи мені ще потрібно принести?'],
  ['office-bescheinigung', 'B1', 'office', 'Ich brauche eine Bescheinigung für meinen Arbeitgeber.', 'İşəgötürənim üçün arayış lazımdır.', 'I need a certificate for my employer.', 'Мне нужна справка для работодателя.', 'İşverenim için bir belge lazım.', 'Мені потрібна довідка для роботодавця.'],
  ['office-frist', 'B1', 'office', 'Bis wann muss ich den Antrag abgeben?', 'Ərizəni nə vaxta qədər verməliyəm?', 'By when do I have to hand in the application?', 'До какого срока нужно подать заявление?', 'Başvuruyu ne zamana kadar vermem gerekiyor?', 'До якого терміну треба подати заяву?'],
  // care
  ['care-guten-morgen', 'A1', 'care', 'Guten Morgen, wie haben Sie geschlafen?', 'Sabahınız xeyir, necə yatdınız?', 'Good morning, how did you sleep?', 'Доброе утро, как вы спали?', 'Günaydın, nasıl uyudunuz?', 'Доброго ранку, як ви спали?'],
  ['care-schmerzen', 'A2', 'care', 'Haben Sie heute Schmerzen?', 'Bu gün ağrınız var?', 'Are you in pain today?', 'У вас сегодня что-нибудь болит?', 'Bugün ağrınız var mı?', 'У вас сьогодні щось болить?'],
  ['care-blutdruck', 'A2', 'care', 'Ich messe jetzt Ihren Blutdruck.', 'İndi qan təzyiqinizi ölçürəm.', 'I am now taking your blood pressure.', 'Сейчас я измерю вам давление.', 'Şimdi tansiyonunuzu ölçüyorum.', 'Зараз я виміряю вам тиск.'],
  ['care-medikamente', 'A2', 'care', 'Bitte nehmen Sie Ihre Tabletten mit Wasser.', 'Zəhmət olmasa, dərmanlarınızı su ilə için.', 'Please take your tablets with water.', 'Пожалуйста, запейте таблетки водой.', 'Lütfen ilaçlarınızı suyla alın.', 'Будь ласка, запийте таблетки водою.'],
  ['care-dokumentation', 'B1', 'care', 'Ich trage die Werte gleich in die Dokumentation ein.', 'Göstəriciləri indi sənədləşdirməyə yazıram.', 'I will enter the values in the records right away.', 'Я сразу внесу показатели в документацию.', 'Değerleri hemen dokümantasyona giriyorum.', 'Я одразу внесу показники в документацію.'],
  ['care-uebergabe', 'B1', 'care', 'Bei der Übergabe informiere ich die Kollegin über den Patienten.', 'Növbə təhvilində həmkarıma xəstə haqqında məlumat verirəm.', 'At handover I brief my colleague about the patient.', 'При передаче смены я сообщаю коллеге о пациенте.', 'Vardiya devrinde meslektaşımı hasta hakkında bilgilendiriyorum.', 'Під час передачі зміни я повідомляю колегу про пацієнта.'],
  // construction
  ['bau-helm', 'A1', 'construction', 'Auf der Baustelle trage ich immer einen Helm.', 'Tikintidə həmişə dəbilqə taxıram.', 'On the building site I always wear a helmet.', 'На стройке я всегда ношу каску.', 'Şantiyede her zaman baret takarım.', 'На будові я завжди ношу каску.'],
  ['bau-werkzeug', 'A2', 'construction', 'Kannst du mir bitte die Bohrmaschine geben?', 'Mənə drel verə bilərsən?', 'Can you pass me the drill, please?', 'Подай мне, пожалуйста, дрель.', 'Bana matkabı verebilir misin lütfen?', 'Подай мені, будь ласка, дриль.'],
  ['bau-material', 'A2', 'construction', 'Wir brauchen noch zehn Säcke Zement.', 'Bizə daha on kisə sement lazımdır.', 'We still need ten bags of cement.', 'Нам нужно ещё десять мешков цемента.', 'On torba çimentoya daha ihtiyacımız var.', 'Нам потрібно ще десять мішків цементу.'],
  ['bau-geruest', 'B1', 'construction', 'Das Gerüst muss vor Arbeitsbeginn geprüft werden.', 'İş başlamazdan əvvəl iskele yoxlanılmalıdır.', 'The scaffolding must be checked before work starts.', 'Леса нужно проверить до начала работ.', 'İskele işe başlamadan önce kontrol edilmeli.', 'Риштування треба перевірити до початку робіт.'],
  ['bau-plan', 'B1', 'construction', 'Laut Plan kommt die Wand zwanzig Zentimeter weiter nach links.', 'Plana görə divar iyirmi santimetr sola gəlir.', 'According to the plan, the wall goes twenty centimetres further left.', 'По плану стена сдвигается на двадцать сантиметров влево.', 'Plana göre duvar yirmi santim daha sola gelecek.', 'За планом стіна зсувається на двадцять сантиметрів ліворуч.'],
  // drivers
  ['fahrer-lieferung', 'A1', 'driving', 'Ich habe eine Lieferung für Sie.', 'Sizə çatdırılma var.', 'I have a delivery for you.', 'У меня для вас доставка.', 'Size bir teslimat var.', 'У мене для вас доставка.'],
  ['fahrer-rampe', 'A2', 'driving', 'An welcher Rampe soll ich abladen?', 'Hansı rampada boşaltmalıyam?', 'At which loading bay should I unload?', 'У какой рампы мне разгружаться?', 'Hangi rampada boşaltmalıyım?', 'Біля якої рампи мені розвантажуватися?'],
  ['fahrer-stau', 'A2', 'driving', 'Ich stehe im Stau und komme etwa dreißig Minuten später.', 'Tıxacdayam, təxminən otuz dəqiqə gecikəcəyəm.', 'I am stuck in traffic and will be about thirty minutes late.', 'Я в пробке и опоздаю примерно на тридцать минут.', 'Trafikteyim, yaklaşık otuz dakika geç kalacağım.', 'Я в заторі й запізнюся приблизно на тридцять хвилин.'],
  ['fahrer-lenkzeit', 'B1', 'driving', 'Nach viereinhalb Stunden Lenkzeit mache ich eine Pause.', 'Dörd yarım saat sükan arxasından sonra fasilə verirəm.', 'After four and a half hours of driving I take a break.', 'После четырёх с половиной часов за рулём я делаю перерыв.', 'Dört buçuk saat sürüşten sonra mola veriyorum.', 'Після чотирьох з половиною годин за кермом я роблю перерву.'],
  ['fahrer-lieferschein', 'B1', 'driving', 'Bitte unterschreiben Sie hier auf dem Lieferschein.', 'Zəhmət olmasa, burada qaimədə imza atın.', 'Please sign the delivery note here.', 'Пожалуйста, распишитесь здесь в накладной.', 'Lütfen burada irsaliyeyi imzalayın.', 'Будь ласка, розпишіться тут у накладній.'],
  // hospitality
  ['gastro-tisch', 'A1', 'hospitality', 'Haben Sie einen Tisch reserviert?', 'Masa sifariş etmisiniz?', 'Have you reserved a table?', 'Вы бронировали столик?', 'Masa ayırttınız mı?', 'Ви бронювали столик?'],
  ['gastro-bestellen', 'A1', 'hospitality', 'Was möchten Sie trinken?', 'Nə içmək istəyirsiniz?', 'What would you like to drink?', 'Что вы будете пить?', 'Ne içmek istersiniz?', 'Що ви будете пити?'],
  ['gastro-rechnung', 'A2', 'hospitality', 'Zahlen Sie zusammen oder getrennt?', 'Birlikdə ödəyirsiniz, yoxsa ayrı-ayrı?', 'Are you paying together or separately?', 'Вы платите вместе или раздельно?', 'Birlikte mi ödüyorsunuz, ayrı mı?', 'Ви платите разом чи окремо?'],
  ['gastro-allergie', 'B1', 'hospitality', 'Dieses Gericht enthält Nüsse, haben Sie Allergien?', 'Bu yeməkdə qoz-fındıq var, allergiyanız varmı?', 'This dish contains nuts — do you have any allergies?', 'В этом блюде есть орехи, у вас есть аллергия?', 'Bu yemekte kuruyemiş var, alerjiniz var mı?', 'У цій страві є горіхи, у вас є алергія?'],
  ['gastro-zimmer', 'B1', 'hospitality', 'Ihr Zimmer ist ab fünfzehn Uhr bezugsfertig.', 'Otağınız saat on beşdən hazır olacaq.', 'Your room will be ready from three p.m.', 'Ваш номер будет готов с пятнадцати часов.', 'Odanız saat on beşten itibaren hazır.', 'Ваш номер буде готовий із п’ятнадцятої години.'],
  // electricians
  ['elektro-strom', 'A2', 'electrical', 'Hast du den Strom abgeschaltet?', 'Cərəyanı söndürmüsən?', 'Did you switch off the power?', 'Ты отключил ток?', 'Elektriği kapattın mı?', 'Ти вимкнув струм?'],
  ['elektro-kabel', 'A2', 'electrical', 'Das Kabel ist zu kurz, wir brauchen ein längeres.', 'Kabel çox qısadır, bizə daha uzunu lazımdır.', 'The cable is too short, we need a longer one.', 'Кабель слишком короткий, нужен длиннее.', 'Kablo çok kısa, daha uzun bir tane lazım.', 'Кабель закороткий, потрібен довший.'],
  ['elektro-sicherung', 'B1', 'electrical', 'Die Sicherung ist rausgeflogen, ich prüfe den Stromkreis.', 'Qoruyucu atıb, elektrik dövrəsini yoxlayıram.', 'The fuse has tripped, I am checking the circuit.', 'Выбило предохранитель, я проверяю цепь.', 'Sigorta attı, devreyi kontrol ediyorum.', 'Вибило запобіжник, я перевіряю коло.'],
  ['elektro-regeln', 'B1', 'electrical', 'Vor der Arbeit prüfe ich die Spannungsfreiheit.', 'İşdən əvvəl gərginliyin olmadığını yoxlayıram.', 'Before working I verify that there is no voltage.', 'Перед работой я проверяю отсутствие напряжения.', 'Çalışmadan önce gerilim olmadığını kontrol ediyorum.', 'Перед роботою я перевіряю відсутність напруги.'],
  ['elektro-steckdose', 'A2', 'electrical', 'Wo soll die neue Steckdose hin?', 'Yeni rozetka hara qoyulsun?', 'Where should the new socket go?', 'Куда поставить новую розетку?', 'Yeni priz nereye gelsin?', 'Куди поставити нову розетку?'],
  // everyday, B1 (the phrase list is A1 / A2)
  ['alltag-wohnung', 'B1', 'everyday', 'Ich suche eine Wohnung in der Nähe meiner Arbeit.', 'İşimə yaxın mənzil axtarıram.', 'I am looking for a flat near my work.', 'Я ищу квартиру рядом с работой.', 'İşime yakın bir daire arıyorum.', 'Я шукаю квартиру поблизу роботи.'],
  ['alltag-heizung', 'B1', 'everyday', 'Die Heizung funktioniert seit gestern nicht mehr.', 'İstilik dünəndən bəri işləmir.', 'The heating has not been working since yesterday.', 'Отопление со вчерашнего дня не работает.', 'Kalorifer dünden beri çalışmıyor.', 'Опалення не працює з учорашнього дня.'],
];

const own: Sentence[] = ROWS.map(([id, level, topic, de, az, en, ru, tr, uk]) => ({ id, level, topic, de, tx: { az, en, ru, tr, uk } }));

/** Phrase of the day rows as everyday sentences: up to three words A1, longer A2 (placeholders "…" skipped). */
const everyday: Sentence[] = PHRASES.filter((p) => !p.de.includes('…')).map((p) => ({
  id: `p-${p.id}`,
  level: p.de.split(/\s+/).length <= 3 ? 'A1' : 'A2',
  topic: 'everyday',
  de: p.de,
  tx: { az: p.az, en: p.en, ru: p.ru, tr: p.tr, uk: p.uk },
}));

export const SENTENCES: Sentence[] = [...everyday, ...own];

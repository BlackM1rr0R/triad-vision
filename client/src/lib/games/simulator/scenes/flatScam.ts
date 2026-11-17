import { ending, line, phrase, reply, t6, type Scene } from '../types';

/**
 * A fake flat advert (Wohnungsbetrug), also played on /apartment-viewing. The pattern the consumer centres warn
 * about (verbraucherzentrale.de, "Fake-Wohnungen im Internet", checked November 2026): a flat far below the local
 * rent level, the "owner" is abroad and cannot show it, keys are to come by post after a deposit sent by a cash
 * transfer service (e.g. Western Union) or to a foreign account, plus a copy of your passport, under time pressure.
 * Rule: no money and no ID copy before a viewing and a lease signed by both sides; report the ad to the portal and
 * the police.
 */
export const FLAT_SCAM: Scene = {
  id: 'flatScam',
  title: t6(['Saxta mənzil elanı', 'Vorsicht, Fake-Wohnung', 'Beware of fake flat adverts', 'Осторожно: фейковая квартира', 'Dikkat: sahte daire ilanı', 'Обережно: фейкова квартира']),
  setting: t6([
    'Kölndə çox ucuz mənzil elanına yazdınız. «Ev sahibi» cavab verir.',
    'Sie haben auf eine sehr günstige Anzeige in Köln geschrieben. Der „Vermieter“ antwortet.',
    'You replied to a very cheap advert in Cologne. The “landlord” answers.',
    'Вы откликнулись на очень дешёвое объявление в Кёльне. «Арендодатель» отвечает.',
    'Köln’de çok ucuz bir ilana yazdınız. “Ev sahibi” cevap veriyor.',
    'Ви відгукнулися на дуже дешеве оголошення в Кельні. «Орендодавець» відповідає.',
  ]),
  speaker: 'Angeblicher Vermieter',
  start: 'mail',
  nodes: [
    line('mail', 'Hallo! Die Wohnung in Köln-Ehrenfeld ist noch frei: 2 Zimmer, 450 Euro warm. Ich arbeite leider gerade in London und kann sie Ihnen nicht zeigen.', ['Salam! Köln-Ehrenfelddəki mənzil hələ boşdur: 2 otaq, isti 450 avro. Təəssüf ki, hazırda Londonda işləyirəm və onu sizə göstərə bilmərəm.', 'Hello! The flat in Cologne-Ehrenfeld is still free: 2 rooms, 450 euros warm. Unfortunately I’m working in London right now and can’t show it to you.', 'Здравствуйте! Квартира в Кёльне-Эренфельде ещё свободна: 2 комнаты, 450 евро «тёплая». К сожалению, я сейчас работаю в Лондоне и не могу её показать.', 'Merhaba! Köln-Ehrenfeld’deki daire hâlâ boş: 2 oda, sıcak 450 euro. Maalesef şu an Londra’da çalışıyorum, size gösteremem.', 'Привіт! Квартира в Кельні-Еренфельді ще вільна: 2 кімнати, 450 євро «тепла». На жаль, я зараз працюю в Лондоні й не можу її показати.'], [
      reply('good', 'Danke. Ich möchte die Wohnung vor jeder Zahlung besichtigen. Wer kann sie mir zeigen?', ['Təşəkkürlər. Hər hansı ödənişdən əvvəl mənzilə baxmaq istəyirəm. Onu mənə kim göstərə bilər?', 'Thanks. I want to view the flat before any payment. Who can show it to me?', 'Спасибо. Я хочу осмотреть квартиру до любой оплаты. Кто может её показать?', 'Teşekkürler. Her türlü ödemeden önce daireyi görmek istiyorum. Bana kim gösterebilir?', 'Дякую. Я хочу оглянути квартиру до будь-якої оплати. Хто може її показати?'], 'pressure'),
      reply('ok', 'So günstig? Wie ist das möglich?', ['Bu qədər ucuz? Bu necə mümkündür?', 'That cheap? How is that possible?', 'Так дёшево? Как это возможно?', 'Bu kadar ucuz mu? Nasıl mümkün?', 'Так дешево? Як це можливо?'], 'pressure', [
        'Düzgün şübhə: şəhərin orta qiymətindən xeyli ucuz qiymət — təhlükə siqnalıdır. Amma ən vacibi: baxışda israr edin.',
        'Richtiger Verdacht: Ein Preis weit unter dem örtlichen Niveau ist ein Warnsignal. Wichtiger noch: Bestehen Sie auf einer Besichtigung.',
        'Right suspicion: a price far below the local level is a warning sign. More important: insist on a viewing.',
        'Верное подозрение: цена намного ниже местного уровня — тревожный знак. Ещё важнее: настаивайте на осмотре.',
        'Doğru şüphe: yerel seviyenin çok altındaki fiyat bir uyarı işaretidir. Daha önemlisi: görmekte ısrar edin.',
        'Правильна підозра: ціна набагато нижча за місцевий рівень — тривожний знак. Ще важливіше: наполягайте на огляді.',
      ]),
      reply('bad', 'Super, ich nehme sie sofort! Was muss ich tun?', ['Əla, dərhal götürürəm! Nə etməliyəm?', 'Great, I’ll take it right away! What do I have to do?', 'Отлично, беру сразу! Что нужно сделать?', 'Harika, hemen tutuyorum! Ne yapmam gerekiyor?', 'Чудово, беру одразу! Що треба зробити?'], 'pay', [
        'Ev sahibi xaricdədir, mənzili göstərə bilmir və qiymət çox aşağıdır — bu, saxta elanın klassik nümunəsidir. Heç vaxt görmədən razılaşmayın.',
        'Vermieter im Ausland, keine Besichtigung möglich, Preis viel zu niedrig – das ist das klassische Muster einer Fake-Anzeige. Sagen Sie nie ungesehen zu.',
        'Landlord abroad, no viewing possible, price far too low — that is the classic pattern of a fake ad. Never agree unseen.',
        'Арендодатель за границей, осмотр невозможен, цена слишком низкая — классическая схема фейка. Никогда не соглашайтесь не глядя.',
        'Ev sahibi yurt dışında, görme imkânı yok, fiyat çok düşük — sahte ilanın klasik kalıbı. Asla görmeden kabul etmeyin.',
        'Орендодавець за кордоном, огляд неможливий, ціна занизька — класична схема фейку. Ніколи не погоджуйтеся не дивлячись.',
      ]),
    ]),
    line('pressure', 'Es gibt sehr viele Interessenten. Überweisen Sie die Kaution von 900 Euro per Western Union, dann schicke ich Ihnen die Schlüssel per Post.', ['Çoxlu namizəd var. 900 avro depoziti Western Union ilə göndərin, sonra açarları poçtla göndərərəm.', 'There are lots of applicants. Send the 900-euro deposit via Western Union, then I’ll post you the keys.', 'Желающих очень много. Переведите залог 900 евро через Western Union, и я пришлю ключи по почте.', 'Çok fazla aday var. 900 euro depozitoyu Western Union ile gönderin, anahtarları postayla yollarım.', 'Охочих дуже багато. Переведіть заставу 900 євро через Western Union, і я надішлю ключі поштою.'], [
      reply('good', 'Nein. Ich zahle nichts vor einer Besichtigung und einem unterschriebenen Mietvertrag.', ['Xeyr. Baxışdan və imzalanmış kirayə müqaviləsindən əvvəl heç nə ödəmirəm.', 'No. I pay nothing before a viewing and a signed lease.', 'Нет. Я ничего не плачу до осмотра и подписанного договора аренды.', 'Hayır. Görmeden ve imzalı kira sözleşmesi olmadan hiçbir şey ödemem.', 'Ні. Я нічого не плачу до огляду й підписаного договору оренди.'], 'endSafe'),
      reply('ok', 'Kann ich nicht lieber per Banküberweisung zahlen?', ['Bank köçürməsi ilə ödəyə bilmərəm?', 'Can’t I pay by bank transfer instead?', 'А нельзя ли банковским переводом?', 'Banka havalesiyle ödeyemez miyim?', 'А чи не можна банківським переказом?'], 'idCopy', [
        'Ödəniş üsulu problemi həll etmir: baxış və müqavilə olmadan heç bir ödəniş etməyin. Pul köçürmə xidmətləri ilə göndərilən pul demək olar ki, geri qaytarılmır.',
        'Der Zahlungsweg löst das Problem nicht: Ohne Besichtigung und Vertrag zahlen Sie gar nichts. Bargeldtransfers sind praktisch nicht zurückzuholen.',
        'The payment method does not solve the problem: without a viewing and a contract you pay nothing at all. Cash transfers are practically impossible to recover.',
        'Способ оплаты не решает проблему: без осмотра и договора не платите вообще. Деньги через сервисы денежных переводов почти невозможно вернуть.',
        'Ödeme yolu sorunu çözmez: görme ve sözleşme olmadan hiç ödeme yapmayın. Nakit transferler neredeyse geri alınamaz.',
        'Спосіб оплати не розв’язує проблему: без огляду й договору не платіть узагалі. Гроші через сервіси переказів майже неможливо повернути.',
      ]),
      reply('bad', 'Okay, ich überweise heute noch.', ['Yaxşı, bu gün köçürərəm.', 'Okay, I’ll transfer it today.', 'Хорошо, переведу сегодня.', 'Tamam, bugün gönderiyorum.', 'Добре, перекажу сьогодні.'], 'endLost', [
        'Bu, fırıldaqdır: açarlar heç vaxt gəlməyəcək. Vaxt təzyiqi («çox namizəd var») tipik hiylədir.',
        'Das ist Betrug: Die Schlüssel kommen nie an. Zeitdruck („sehr viele Interessenten“) ist ein typischer Trick.',
        'This is a scam: the keys will never arrive. Time pressure (“lots of applicants”) is a typical trick.',
        'Это мошенничество: ключи никогда не придут. Давление временем («много желающих») — типичный приём.',
        'Bu dolandırıcılık: anahtarlar asla gelmez. Zaman baskısı (“çok aday var”) tipik bir hiledir.',
        'Це шахрайство: ключі ніколи не прийдуть. Тиск часом («багато охочих») — типовий прийом.',
      ]),
    ]),
    line('pay', 'Prima! Schicken Sie mir zuerst eine Kopie Ihres Passes und überweisen Sie die Kaution per Western Union. Die Schlüssel kommen dann per Post.', ['Əla! Əvvəlcə pasportunuzun surətini göndərin və depoziti Western Union ilə köçürün. Açarlar sonra poçtla gələcək.', 'Great! First send me a copy of your passport and transfer the deposit via Western Union. The keys will then come by post.', 'Отлично! Сначала пришлите копию паспорта и переведите залог через Western Union. Ключи придут по почте.', 'Harika! Önce pasaportunuzun kopyasını gönderin ve depozitoyu Western Union ile yatırın. Anahtarlar sonra postayla gelir.', 'Чудово! Спершу надішліть копію паспорта й перекажіть заставу через Western Union. Ключі прийдуть поштою.'], [
      reply('good', 'Moment, das ist mir zu unsicher. Ich zahle erst nach Besichtigung und Vertrag.', ['Bir dəqiqə, bu mənə çox etibarsız görünür. Yalnız baxış və müqavilədən sonra ödəyirəm.', 'Wait, that’s too unsafe for me. I only pay after a viewing and a contract.', 'Минутку, это слишком ненадёжно. Плачу только после осмотра и договора.', 'Bir dakika, bu bana çok güvensiz geliyor. Ancak görme ve sözleşmeden sonra öderim.', 'Хвилинку, це надто ненадійно. Плачу лише після огляду й договору.'], 'endSafe'),
      reply('ok', 'Brauchen Sie wirklich meinen Pass?', ['Pasportum həqiqətən lazımdır?', 'Do you really need my passport?', 'Вам правда нужен мой паспорт?', 'Pasaportum gerçekten gerekli mi?', 'Вам справді потрібен мій паспорт?'], 'idCopy', [
        'Yaxşı sual: ev sahibi baxışda sənədə yalnız baxa bilər, surət lazım deyil. Pasport surəti ilə fırıldaqçılar sizin adınızdan hesab aça və ya başqalarını aldada bilər.',
        'Gute Frage: Ein Vermieter darf den Ausweis bei der Besichtigung nur ansehen, eine Kopie braucht er nicht. Mit Passkopien eröffnen Betrüger Konten oder täuschen andere.',
        'Good question: a landlord may only look at your ID at the viewing, he needs no copy. With passport copies scammers open accounts or deceive others in your name.',
        'Хороший вопрос: арендодатель может лишь посмотреть документ на осмотре, копия ему не нужна. По копиям паспортов мошенники открывают счета и обманывают других.',
        'İyi soru: ev sahibi görmede kimliğe sadece bakabilir, kopyaya ihtiyacı yok. Pasaport kopyalarıyla dolandırıcılar hesap açar veya başkalarını kandırır.',
        'Добре питання: орендодавець може лише подивитися документ на огляді, копія йому не потрібна. З копіями паспортів шахраї відкривають рахунки чи ошукують інших.',
      ]),
      reply('bad', 'Hier ist die Passkopie, das Geld schicke ich gleich.', ['Pasport surəti budur, pulu indi göndərirəm.', 'Here is the passport copy, I’ll send the money right away.', 'Вот копия паспорта, деньги отправлю сейчас.', 'İşte pasaport kopyası, parayı hemen gönderiyorum.', 'Ось копія паспорта, гроші надішлю зараз.'], 'endLost', [
        'Həm pulu, həm də şəxsi məlumatlarınızı itirdiniz. Dərhal bankla əlaqə saxlayın, polisə müraciət edin və elanı portala bildirin.',
        'Geld und persönliche Daten sind weg. Sofort die Bank bzw. den Transferdienst kontaktieren, Anzeige bei der Polizei erstatten und die Anzeige dem Portal melden.',
        'Money and personal data are gone. Contact the bank or transfer service at once, report it to the police and flag the ad to the portal.',
        'Деньги и личные данные потеряны. Сразу свяжитесь с банком или сервисом перевода, заявите в полицию и сообщите об объявлении порталу.',
        'Para ve kişisel veriler gitti. Hemen banka veya transfer hizmetiyle iletişime geçin, polise şikâyette bulunun ve ilanı portala bildirin.',
        'Гроші й особисті дані втрачено. Негайно зверніться до банку чи сервісу переказу, заявіть у поліцію й повідомте портал про оголошення.',
      ]),
    ]),
    line('idCopy', 'Ja, das ist nur zur Sicherheit. Bitte heute noch, sonst ist die Wohnung weg.', ['Bəli, sadəcə təhlükəsizlik üçün. Xahiş edirəm bu gün, yoxsa mənzil gedəcək.', 'Yes, it’s just for security. Please today, otherwise the flat is gone.', 'Да, это просто для безопасности. Пожалуйста, сегодня, иначе квартиру заберут.', 'Evet, sadece güvenlik için. Lütfen bugün, yoksa daire gider.', 'Так, це лише для безпеки. Будь ласка, сьогодні, інакше квартиру заберуть.'], [
      reply('good', 'Nein. Ich schicke weder eine Ausweiskopie noch Geld und melde die Anzeige dem Portal.', ['Xeyr. Nə sənəd surəti, nə də pul göndərəcəyəm, elanı isə portala bildirəcəyəm.', 'No. I will send neither an ID copy nor money, and I’ll report the ad to the portal.', 'Нет. Я не пришлю ни копию документа, ни деньги и сообщу об объявлении порталу.', 'Hayır. Ne kimlik kopyası ne de para göndereceğim, ilanı portala bildireceğim.', 'Ні. Я не надішлю ні копію документа, ні гроші й повідомлю портал про оголошення.'], 'endSafe'),
      reply('ok', 'Ich überlege es mir noch.', ['Hələ fikirləşəcəyəm.', 'I’ll think about it.', 'Я ещё подумаю.', 'Biraz düşüneyim.', 'Я ще подумаю.'], 'endPartial', [
        'Ödəmədiniz — yaxşıdır. Amma bu, fırıldaqdır: «fikirləşmək» lazım deyil, yazışmanı dayandırın və elanı bildirin ki, başqaları aldanmasın.',
        'Sie haben nicht gezahlt – gut. Aber hier gibt es nichts zu überlegen: Brechen Sie den Kontakt ab und melden Sie die Anzeige, damit niemand anderes hereinfällt.',
        'You did not pay — good. But there is nothing to think about: cut contact and report the ad so nobody else falls for it.',
        'Вы не заплатили — хорошо. Но думать тут не о чем: прекратите переписку и сообщите об объявлении, чтобы другие не попались.',
        'Ödemediniz — iyi. Ama düşünecek bir şey yok: iletişimi kesin ve başkaları kanmasın diye ilanı bildirin.',
        'Ви не заплатили — добре. Але тут нема про що думати: припиніть листування й повідомте про оголошення, щоб інші не потрапили.',
      ]),
      reply('bad', 'Na gut, ich schicke Ihnen alles.', ['Yaxşı, hər şeyi göndərirəm.', 'All right, I’ll send you everything.', 'Ладно, пришлю всё.', 'Peki, her şeyi gönderiyorum.', 'Гаразд, надішлю все.'], 'endLost', [
        'Vaxt təzyiqi altında qərar verməyin. Real ev sahibi baxış təklif edir və imzalanmış müqavilədən əvvəl pul istəmir.',
        'Entscheiden Sie nie unter Zeitdruck. Echte Vermieter bieten eine Besichtigung an und verlangen vor einem unterschriebenen Vertrag kein Geld.',
        'Never decide under time pressure. Real landlords offer a viewing and ask for no money before a signed contract.',
        'Никогда не решайте под давлением времени. Настоящий арендодатель предлагает осмотр и не просит денег до подписанного договора.',
        'Zaman baskısı altında asla karar vermeyin. Gerçek ev sahipleri görme imkânı sunar ve imzalı sözleşmeden önce para istemez.',
        'Ніколи не вирішуйте під тиском часу. Справжній орендодавець пропонує огляд і не просить грошей до підписаного договору.',
      ]),
    ]),
    ending('endSafe', '… (keine Antwort mehr)', ['… (cavab gəlmir)', '… (no more replies)', '… (ответа больше нет)', '… (cevap gelmiyor)', '… (відповіді більше немає)'], 'success', [
      'Düzgün! «Ev sahibi» yox oldu — fırıldaqçı idi. Qayda: baxış və hər iki tərəfin imzaladığı müqavilədən əvvəl pul və sənəd surəti yoxdur. Elanı portala bildirin.',
      'Richtig! Der „Vermieter“ ist verschwunden – es war ein Betrüger. Regel: Kein Geld und keine Ausweiskopie vor Besichtigung und beidseitig unterschriebenem Mietvertrag. Melden Sie die Anzeige dem Portal.',
      'Right! The “landlord” vanished — it was a scammer. Rule: no money and no ID copy before a viewing and a lease signed by both sides. Report the ad to the portal.',
      'Верно! «Арендодатель» исчез — это был мошенник. Правило: никаких денег и копий документов до осмотра и подписанного обеими сторонами договора. Сообщите порталу.',
      'Doğru! “Ev sahibi” ortadan kayboldu — dolandırıcıydı. Kural: görme ve iki tarafça imzalanmış sözleşmeden önce para ve kimlik kopyası yok. İlanı portala bildirin.',
      'Правильно! «Орендодавець» зник — це був шахрай. Правило: жодних грошей і копій документів до огляду й підписаного обома сторонами договору. Повідомте портал.',
    ]),
    ending('endPartial', 'Letzte Chance! Morgen ist die Wohnung vergeben.', ['Son şans! Sabah mənzil veriləcək.', 'Last chance! Tomorrow the flat will be gone.', 'Последний шанс! Завтра квартиру отдадут.', 'Son şans! Yarın daire gidiyor.', 'Останній шанс! Завтра квартиру віддадуть.'], 'partial', [
      'Pul itirmədiniz, amma fırıldaqçı təzyiq etməyə davam edir. Yazışmanı bitirin, elanı bildirin və heç vaxt Western Union və ya xarici hesaba depozit göndərməyin.',
      'Kein Geld verloren, aber der Betrüger macht weiter Druck. Kontakt abbrechen, Anzeige melden – und nie eine Kaution per Western Union oder auf ein ausländisches Konto schicken.',
      'No money lost, but the scammer keeps pushing. Cut contact, report the ad — and never send a deposit via Western Union or to a foreign account.',
      'Деньги не потеряны, но мошенник продолжает давить. Прекратите контакт, сообщите об объявлении и никогда не отправляйте залог через Western Union или на иностранный счёт.',
      'Para kaybetmediniz ama dolandırıcı baskıya devam ediyor. İletişimi kesin, ilanı bildirin — ve asla Western Union ile veya yabancı hesaba depozito göndermeyin.',
      'Гроші не втрачено, але шахрай і далі тисне. Припиніть контакт, повідомте про оголошення — і ніколи не надсилайте заставу через Western Union чи на іноземний рахунок.',
    ]),
    ending('endLost', 'Danke! Die Schlüssel sind unterwegs. (Sie kommen nie an.)', ['Təşəkkürlər! Açarlar yoldadır. (Heç vaxt gəlməyəcək.)', 'Thanks! The keys are on their way. (They never arrive.)', 'Спасибо! Ключи уже в пути. (Они никогда не придут.)', 'Teşekkürler! Anahtarlar yolda. (Asla gelmeyecek.)', 'Дякую! Ключі вже в дорозі. (Вони ніколи не прийдуть.)'], 'fail', [
      'Bu, saxta elan idi. Dərhal: bank / köçürmə xidməti ilə əlaqə, polisə ərizə (Strafanzeige), elanı portala bildirin. Qayda: baxış və imzalı müqavilədən əvvəl heç bir ödəniş yoxdur.',
      'Es war eine Fake-Anzeige. Sofort: Bank bzw. Transferdienst kontaktieren, Strafanzeige bei der Polizei, Anzeige beim Portal melden. Regel: keine Zahlung vor Besichtigung und unterschriebenem Vertrag.',
      'It was a fake ad. Right away: contact the bank or transfer service, file a police report (Strafanzeige), report the ad to the portal. Rule: no payment before a viewing and a signed contract.',
      'Это было фейковое объявление. Сразу: банк или сервис перевода, заявление в полицию (Strafanzeige), жалоба на портал. Правило: никаких платежей до осмотра и подписанного договора.',
      'Sahte bir ilandı. Hemen: banka veya transfer hizmeti, polise suç duyurusu (Strafanzeige), ilanı portala bildirin. Kural: görme ve imzalı sözleşmeden önce ödeme yok.',
      'Це було фейкове оголошення. Негайно: банк чи сервіс переказу, заява в поліцію (Strafanzeige), скарга на портал. Правило: жодних платежів до огляду й підписаного договору.',
    ]),
  ],
  phrases: [
    phrase('Ich möchte die Wohnung zuerst besichtigen.', ['Əvvəlcə mənzilə baxmaq istəyirəm.', 'I want to view the flat first.', 'Сначала я хочу осмотреть квартиру.', 'Önce daireyi görmek istiyorum.', 'Спершу я хочу оглянути квартиру.'], 'wohnungsbesichtigung'),
    phrase('Ich zahle die Kaution erst nach Vertragsunterschrift.', ['Depoziti yalnız müqavilə imzalandıqdan sonra ödəyirəm.', 'I pay the deposit only after signing the contract.', 'Залог я плачу только после подписания договора.', 'Depozitoyu ancak sözleşme imzalandıktan sonra öderim.', 'Заставу я сплачую лише після підписання договору.'], 'kaution'),
    phrase('Bitte schicken Sie mir den Mietvertrag zur Ansicht.', ['Zəhmət olmasa, kirayə müqaviləsini baxmaq üçün göndərin.', 'Please send me the lease to look at.', 'Пришлите, пожалуйста, договор аренды для ознакомления.', 'Lütfen kira sözleşmesini incelemem için gönderin.', 'Надішліть, будь ласка, договір оренди для ознайомлення.'], 'mietvertrag'),
    phrase('Sind Sie der Vermieter oder ein Makler?', ['Siz ev sahibisiniz, yoxsa makler?', 'Are you the landlord or an estate agent?', 'Вы арендодатель или маклер?', 'Ev sahibi misiniz yoksa emlakçı mı?', 'Ви орендодавець чи маклер?'], 'vermieter'),
    phrase('Ich erstatte Anzeige bei der Polizei.', ['Polisə ərizə verirəm.', 'I am reporting this to the police.', 'Я подаю заявление в полицию.', 'Polise suç duyurusunda bulunuyorum.', 'Я подаю заяву в поліцію.']),
  ],
};

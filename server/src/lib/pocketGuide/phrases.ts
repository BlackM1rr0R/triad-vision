/**
 * The 40 phrases of the Germany pocket guide: a verbatim subset of the site's phrase list
 * (client/src/components/world/phrases.ts — German, translations and the pronunciation aids for Azerbaijani and
 * Russian readers). The server cannot import client files, so the rows are copied; tests/unit/pocketGuide.test.ts
 * checks that every row still equals its source row. Order = order in the booklet.
 * Row: id, German, az, ru, en, pronunciation (az Latin), pronunciation (Cyrillic).
 */
export type PocketPhrase = [id: string, de: string, az: string, ru: string, en: string, pronAz: string, pronRu: string];

// prettier-ignore
export const POCKET_PHRASES: PocketPhrase[] = [
  ["guten-tag","Guten Tag!","Günortanız xeyir!","Добрый день!","Good afternoon! / Hello!","Qutən tak","Гутен таг"],
  ["hallo","Hallo!","Salam!","Привет!","Hi!","Halo","Хало"],
  ["tschuess","Tschüss!","Hələlik!","Пока!","Bye!","Çüs","Чюс"],
  ["auf-wiedersehen","Auf Wiedersehen!","Görüşənədək!","До свидания!","Goodbye!","Auf vidərzeyən","Ауф видерзеен"],
  ["ich-heisse","Ich heiße …","Mənim adım …","Меня зовут …","My name is …","İx haysə …","Ихь хайсе …"],
  ["aus-aserbaidschan","Ich komme aus Aserbaidschan.","Mən Azərbaycandanam.","Я из Азербайджана.","I come from Azerbaijan.","İx komə aus Azerbaycan","Ихь комме аус Азербайджан"],
  ["danke-schoen","Danke schön!","Çox sağ olun!","Большое спасибо!","Thank you very much!","Dankə şön!","Данке шён!"],
  ["bitte-schoen","Bitte schön!","Dəyməz!","Пожалуйста!","You're welcome!","Bitə şön!","Битте шён!"],
  ["entschuldigung","Entschuldigung!","Bağışlayın!","Извините!","Excuse me! / Sorry!","Entşuldiqunq!","Энтшульдигунг!"],
  ["ich-verstehe-nicht","Ich verstehe nicht.","Başa düşmürəm.","Я не понимаю.","I don't understand.","İx ferşteyə nixt","Ихь ферштее нихьт"],
  ["bitte-wiederholen","Können Sie das bitte wiederholen?","Zəhmət olmasa, təkrar edə bilərsiniz?","Не могли бы вы повторить, пожалуйста?","Could you repeat that, please?","Könən zi das bitə vidərholən?","Кённен зи дас битте видерхолен?"],
  ["langsamer-bitte","Sprechen Sie bitte langsamer.","Zəhmət olmasa, yavaş danışın.","Говорите, пожалуйста, медленнее.","Please speak more slowly.","Şprexən zi bitə lanqzamər","Шпрехен зи битте лангзамер"],
  ["sprechen-sie-englisch","Sprechen Sie Englisch?","İngiliscə danışırsınız?","Вы говорите по-английски?","Do you speak English?","Şprexən zi enqliş?","Шпрехен зи энглиш?"],
  ["was-bedeutet-das","Was bedeutet das?","Bu nə deməkdir?","Что это значит?","What does that mean?","Vas bədoytət das?","Вас бедойтет дас?"],
  ["ja-gern","Ja, gern.","Bəli, məmnuniyyətlə.","Да, с удовольствием.","Yes, gladly.","Ya, gern","Я, герн"],
  ["nein-danke","Nein, danke.","Xeyr, sağ olun.","Нет, спасибо.","No, thank you.","Nayn, dankə","Найн, данке"],
  ["ich-habe-eine-frage","Ich habe eine Frage.","Bir sualım var.","У меня есть вопрос.","I have a question.","İx habə aynə fraqə","Ихь хабе айне фраге"],
  ["koennen-sie-mir-helfen","Können Sie mir bitte helfen?","Mənə kömək edə bilərsiniz?","Не могли бы вы мне помочь?","Could you help me, please?","Könən zi mir bitə helfən?","Кённен зи мир битте хельфен?"],
  ["zeigen-sie-mir","Können Sie mir das zeigen?","Bunu mənə göstərə bilərsiniz?","Можете мне это показать?","Can you show me that?","Könən zi mir das tsaygən?","Кённен зи мир дас цайген?"],
  ["ich-bin-krank","Ich bin krank und kann heute nicht kommen.","Xəstəyəm, bu gün gələ bilmirəm.","Я заболел(а) и сегодня не смогу прийти.","I'm sick and can't come in today.","İx bin krank unt kan hoytə nixt komən","Ихь бин кранк унт кан хойте нихьт коммен"],
  ["krankschreibung","Ich brauche eine Krankschreibung.","Mənə xəstəlik vərəqəsi lazımdır.","Мне нужен больничный.","I need a sick note.","İx brauxə aynə krankşraybunq","Ихь браухе айне кранкшрайбунг"],
  ["ansprechpartner","Wer ist mein Ansprechpartner?","Mənim əlaqə şəxsim kimdir?","Кто моё контактное лицо?","Who is my contact person?","Ver ist mayn anşprexpartnər?","Вер ист майн аншпрехпартнер?"],
  ["was-kostet-das","Was kostet das?","Bu neçəyədir?","Сколько это стоит?","How much is this?","Vas kostət das?","Вас костет дас?"],
  ["mit-karte-zahlen","Kann ich mit Karte zahlen?","Kartla ödəyə bilərəm?","Можно оплатить картой?","Can I pay by card?","Kan ix mit kartə tsalən?","Кан ихь мит карте цален?"],
  ["ich-zahle-bar","Ich zahle bar.","Nağd ödəyirəm.","Я заплачу наличными.","I'll pay cash.","İx tsalə bar","Ихь цале бар"],
  ["die-rechnung","Die Rechnung, bitte.","Hesab, zəhmət olmasa.","Счёт, пожалуйста.","The bill, please.","Di rexnunq, bitə","Ди рехнунг, битте"],
  ["wo-ist-der-bahnhof","Wo ist der Bahnhof?","Vağzal haradadır?","Где вокзал?","Where is the train station?","Vo ist der banhof?","Во ист дер банхоф?"],
  ["deutschlandticket","Ich habe ein Deutschlandticket.","Məndə Deutschlandticket var.","У меня есть «Дойчландтикет».","I have a Deutschlandticket.","İx habə ayn doyçlanttikət","Ихь хабе айн дойчландтикет"],
  ["wo-umsteigen","Wo muss ich umsteigen?","Harada başqa qatara və ya avtobusa keçməliyəm?","Где мне сделать пересадку?","Where do I have to change?","Vo mus ix umştaygən?","Во мусс ихь умштайген?"],
  ["brauche-arzt","Ich brauche einen Arzt.","Mənə həkim lazımdır.","Мне нужен врач.","I need a doctor.","İx brauxə aynən artst","Ихь браухе айнен арцт"],
  ["termin-vereinbaren","Ich möchte einen Termin vereinbaren.","Qəbula yazılmaq istəyirəm.","Я хочу записаться на приём.","I'd like to make an appointment.","İx möxtə aynən termin feraynbarən","Ихь мёхьте айнен термин ферайнбарен"],
  ["naechste-apotheke","Wo ist die nächste Apotheke?","Ən yaxın aptek haradadır?","Где ближайшая аптека?","Where is the nearest pharmacy?","Vo ist di nekstə apoteykə?","Во ист ди нэхьсте апотеке?"],
  ["versichertenkarte","Hier ist meine Versichertenkarte.","Budur mənim tibbi sığorta kartım.","Вот моя карта медицинской страховки.","Here is my health insurance card.","Hir ist maynə ferzixərtənkartə","Хир ист майне ферзихертенкарте"],
  ["hilfe","Hilfe!","Kömək edin!","Помогите!","Help!","Hilfə!","Хильфе!"],
  ["notruf-112","Der Notruf ist 112.","Təcili yardım nömrəsi 112-dir.","Номер экстренной помощи — 112.","The emergency number is 112.","Der notruf ist ayns ayns tsvay","Дер нотруф ист айнс айнс цвай"],
  ["anmelden","Ich muss mich beim Bürgeramt anmelden.","Bürgeramt-da qeydiyyatdan keçməliyəm.","Мне нужно зарегистрироваться в бюргерамте.","I have to register at the Bürgeramt.","İx mus mix baym bürgəramt anmeldən","Ихь мусс михь байм бюргерамт анмельден"],
  ["heizung-kaputt","Die Heizung funktioniert nicht.","İstilik sistemi işləmir.","Отопление не работает.","The heating isn't working.","Di haytsunq funktsionirt nixt","Ди хайцунг функционирт нихьт"],
  ["welche-unterlagen","Welche Unterlagen brauche ich?","Hansı sənədlər lazımdır?","Какие документы мне нужны?","Which documents do I need?","Velxə untərlaqən brauxə ix?","Вельхе унтерлаген браухе ихь?"],
  ["konto-eroeffnen","Ich möchte ein Konto eröffnen.","Hesab açmaq istəyirəm.","Я хочу открыть счёт.","I'd like to open an account.","İx möxtə ayn konto eröfnən","Ихь мёхьте айн конто эрёфнен"],
  ["brief-vom-amt","Ich habe einen Brief vom Amt bekommen.","İdarədən məktub almışam.","Я получил(а) письмо из ведомства.","I've received a letter from the authorities.","İx habə aynən brif fom amt bəkomən","Ихь хабе айнен бриф фом амт бекоммен"],
];

/**
 * Steuerklassen chooser for married couples (/tax-class-chooser). All six site languages. Registered with
 * registerCopy(pagesTaxClass). Keys under taxClass.*; taxClass.faq is an array (also FAQPage JSON-LD).
 */
const az = {
  taxClass: {
    heroTitle: 'Evlilər üçün vergi sinfi seçimi: III/V, IV/IV və ya faktor',
    heroSubtitle: 'İki maaşı daxil edin — hər birinin və ailənin aylıq xalis gəliri, bəyannamədən sonra qaytarma və ya əlavə ödəniş. 2026 qaydaları ilə.',
    form: {
      title: 'Maaşlar (2026)',
      grossA: 'A tərəfdaşının aylıq brutto maaşı',
      grossB: 'B tərəfdaşının aylıq brutto maaşı',
      grossHint: 'İşləmirsə 0 yazın. Mini-iş (603 €-dək) vergisiz sayılır.',
      state: 'Federal ştat',
      children: 'Uşaqlar',
      church: 'Kilsə vergisi',
    },
    combo: { factor: 'IV/IV faktorla ({{f}})' },
    result: {
      bestMonthly: 'Ən çox aylıq xalis: {{combo}}',
      annualSame: 'İllik vergi bütün variantlarda eynidir — təxminən {{amount}}. Fərq yalnız ay ərzində nə qədər tutulmasındadır.',
      tableCaption: 'Vergi sinifləri kombinasiyalarının müqayisəsi',
      combo: 'Kombinasiya',
      netA: 'A xalis/ay',
      netB: 'B xalis/ay',
      netTotal: 'Cəmi/ay',
      settlement: 'Bəyannamədən sonra',
      mandatory: 'bəyannamə məcburidir',
      settlementHint: '+ geri qaytarma, − əlavə ödəniş (təxmini; yalnız maaş, standart çıxılmalar, uşaqsız hesablama).',
    },
    explain: {
      same: { title: 'İl sonunda vergi eynidir', text: 'Evli cütlüklər birgə bəyannamə verir (Ehegattensplitting). Vergi sinfi yalnız aylıq tutulmanı dəyişir: III/V-də ay ərzində çox xalis qalır, amma il sonunda fərq ödənilə bilər.' },
      risk: { title: 'III/V: əlavə ödəniş riski', text: 'III/V və faktorlu IV/IV seçənlər bəyannamə verməyə borcludur (§46 EStG). Maaşlar çox fərqli deyilsə, III/V adətən az vergi tutur və Finanzamt fərqi geri tələb edir — pulu kənara qoyun.' },
      factor: { title: 'IV/IV faktorla', text: 'Finanzamt faktoru (məs. 0,962) hesablayır və hər iki tərəfdaşın IV sinif vergisini ona vurur. Aylıq tutulma illik vergiyə ən yaxın olur; ərizəni Finanzamt-a verin, faktor 2 il qüvvədədir.' },
      benefits: { title: 'Elterngeld və işsizlik pulu', text: 'Elterngeld və işsizlik pulu (ALG I) xalis maaşdan hesablanır — sinif III daha yüksək müavinət verir. Elterngeld üçün yeni sinif doğumdan əvvəlki 12 aylıq hesablama dövrünün çox hissəsində (ən azı 7 ay) qüvvədə olmalıdır (§2c Abs. 3 BEEG); ALG I üçün il ərzində dəyişiklik yalnız məhdud hallarda nəzərə alınır (§153 SGB III).' },
    },
    reform: {
      title: 'III/V ləğv olunurmu? (Noyabr 2026)',
      text: 'Hazırda III/V qüvvədədir. 2024-cü ildə 2030-dan faktora keçid planlaşdırılmışdı, amma qanuna daxil edilmədi. Maliyyə Nazirliyi III/V-ni avtomatik faktorla əvəz etməyi yenidən müzakirə edir, lakin 2027 üçün qəbul olunmuş qanun yoxdur. Qərar verilsə, burada yeniləyəcəyik.',
    },
    actions: { salary: 'Maaş kalkulyatoru', refund: 'Vergi qaytarılması' },
    disclaimer: 'Sadələşdirilmiş təxmin: yalnız maaş, standart çıxılmalar, Kinderfreibetrag və digər gəlirlər nəzərə alınmır. Rəsmi faktoru Finanzamt hesablayır. Vergi məsləhəti deyil.',
    faq: [
      { q: 'III/V yoxsa IV/IV — hansı daha sərfəlidir?', a: 'İl sonunda vergi eynidir. III/V maaşlar çox fərqli olduqda (məs. 60/40-dan çox) ay ərzində daha çox xalis verir, amma tez-tez əlavə ödəniş yaranır. Bərabər maaşlarda IV/IV uyğundur; faktorlu IV/IV aylıq tutulmanı illik vergiyə ən yaxın edir.' },
      { q: 'Vergi sinfini necə dəyişmək olar?', a: 'Finanzamt-a "Antrag auf Steuerklassenwechsel bei Ehegatten" ərizəsi (ELSTER ilə onlayn da) verilir. İldə bir neçə dəfə mümkündür; dəyişiklik növbəti aydan qüvvəyə minir. Faktor üçün hər iki maaş göstərilir.' },
      { q: 'Niyə III/V-də əlavə ödəniş olur?', a: 'Sinif V çox vergi, sinif III isə az vergi tutur. Maaşlar arasındakı nisbət 60/40-a yaxın deyilsə, birlikdə il ərzində tutulan vergi illik vergidən az olur və fərq bəyannamə ilə ödənilir. Buna görə III/V-də bəyannamə məcburidir.' },
      { q: 'Vergi sinfi Elterngeld-ə təsir edirmi?', a: 'Bəli, Elterngeld doğumdan əvvəlki 12 ayın xalis maaşından hesablanır. Sinif III xalis maaşı artırır. Bunun nəzərə alınması üçün yeni sinif hesablama dövrünün aylarının çoxunda (12 aydan ən azı 7-də) qüvvədə olmalıdır (§2c Abs. 3 BEEG) — yəni dəyişikliyi analıq məzuniyyətindən təxminən 7 ay əvvəl edin.' },
      { q: 'III və V sinifləri ləğv olunacaqmı?', a: 'Noyabr 2026 vəziyyətinə görə yox: III/V qüvvədədir. Əvvəlki 2030 planı qanuna çevrilmədi, indiki nazirlik planları isə hələ qəbul olunmayıb. Faktorlu IV/IV artıq indi seçilə bilər.' },
    ],
  },
};

const de = {
  taxClass: {
    heroTitle: 'Steuerklassenwahl für Ehepaare: III/V, IV/IV oder Faktor',
    heroSubtitle: 'Zwei Gehälter eintragen – Netto pro Monat für jeden Partner und gemeinsam, dazu Erstattung oder Nachzahlung nach der Steuererklärung. Mit den Werten 2026.',
    form: {
      title: 'Gehälter (2026)',
      grossA: 'Monatliches Brutto Partner A',
      grossB: 'Monatliches Brutto Partner B',
      grossHint: '0 bei keinem Einkommen. Minijob (bis 603 €) ohne Lohnsteuer.',
      state: 'Bundesland',
      children: 'Kinder',
      church: 'Kirchensteuer',
    },
    combo: { factor: 'IV/IV mit Faktor ({{f}})' },
    result: {
      bestMonthly: 'Höchstes Monatsnetto: {{combo}}',
      annualSame: 'Die Jahressteuer ist bei allen Kombinationen gleich – rund {{amount}}. Unterschiedlich ist nur, wie viel unterjährig einbehalten wird.',
      tableCaption: 'Vergleich der Steuerklassenkombinationen',
      combo: 'Kombination',
      netA: 'Netto A/Monat',
      netB: 'Netto B/Monat',
      netTotal: 'Zusammen/Monat',
      settlement: 'Nach Erklärung',
      mandatory: 'Erklärung Pflicht',
      settlementHint: '+ Erstattung, − Nachzahlung (Schätzung; nur Arbeitslohn, Pauschbeträge, ohne Kinderfreibeträge).',
    },
    explain: {
      same: { title: 'Am Jahresende zählt dieselbe Steuer', text: 'Ehepaare werden zusammen veranlagt (Ehegattensplitting). Die Steuerklasse ändert nur den Lohnsteuerabzug im Monat: Mit III/V bleibt unterjährig mehr netto, am Jahresende kann es aber zu einer Nachzahlung kommen.' },
      risk: { title: 'III/V: Risiko Nachzahlung', text: 'Mit III/V und IV/IV mit Faktor ist die Steuererklärung Pflicht (§46 Abs. 2 Nr. 3a EStG). Liegen die Gehälter nicht weit auseinander, wird mit III/V meist zu wenig einbehalten und das Finanzamt fordert nach – Geld zurücklegen.' },
      factor: { title: 'IV/IV mit Faktor', text: 'Das Finanzamt berechnet einen Faktor (z. B. 0,962) und multipliziert die Lohnsteuer der Klasse IV beider Partner damit. So entspricht der Abzug am ehesten der Jahressteuer; Antrag beim Finanzamt, gültig bis zu zwei Jahre.' },
      benefits: { title: 'Elterngeld und Arbeitslosengeld', text: 'Elterngeld und Arbeitslosengeld I richten sich nach dem Netto – Klasse III bringt höhere Leistungen. Für das Elterngeld muss die neue Klasse in der Mehrzahl der Monate des Bemessungszeitraums gelten, also mindestens 7 von 12 (§2c Abs. 3 BEEG); beim ALG I zählt ein Wechsel im laufenden Jahr nur eingeschränkt (§153 SGB III).' },
    },
    reform: {
      title: 'Werden III/V abgeschafft? (Stand November 2026)',
      text: 'Derzeit gelten III/V unverändert. Die 2024 geplante Überführung ins Faktorverfahren ab 2030 wurde nicht Gesetz. Das Bundesfinanzministerium diskutiert erneut ein automatisiertes Faktorverfahren statt III/V, ein beschlossenes Gesetz für 2027 gibt es aber nicht. Sobald sich das ändert, aktualisieren wir den Rechner.',
    },
    actions: { salary: 'Brutto-Netto-Rechner', refund: 'Steuererstattung berechnen' },
    disclaimer: 'Vereinfachte Schätzung: nur Arbeitslohn und Pauschbeträge, ohne Kinderfreibeträge, weitere Einkünfte oder Abzüge. Den amtlichen Faktor berechnet das Finanzamt. Keine Steuerberatung.',
    faq: [
      { q: 'III/V oder IV/IV – was lohnt sich?', a: 'Die Jahressteuer ist gleich. III/V bringt unterjährig mehr Netto, wenn die Gehälter weit auseinanderliegen (etwa ab 60/40), führt aber oft zu Nachzahlungen. Bei ähnlichen Gehältern passt IV/IV; IV/IV mit Faktor bringt den Abzug am nächsten an die Jahressteuer.' },
      { q: 'Wie wechselt man die Steuerklasse?', a: 'Mit dem „Antrag auf Steuerklassenwechsel bei Ehegatten/Lebenspartnern“ beim Finanzamt, auch online über ELSTER. Das geht mehrmals im Jahr; der Wechsel gilt ab dem Folgemonat. Für den Faktor werden beide Jahresarbeitslöhne angegeben.' },
      { q: 'Warum gibt es bei III/V Nachzahlungen?', a: 'Klasse V behält viel, Klasse III wenig Lohnsteuer ein. Passt das Verhältnis der Gehälter nicht etwa zu 60/40, wird zusammen weniger einbehalten als die Jahressteuer – der Rest wird mit der Erklärung fällig. Deshalb ist die Erklärung bei III/V Pflicht.' },
      { q: 'Beeinflusst die Steuerklasse das Elterngeld?', a: 'Ja, das Elterngeld richtet sich nach dem Netto der 12 Monate vor der Geburt. Klasse III erhöht das Netto. Damit der Wechsel zählt, muss die neue Klasse in der überwiegenden Zahl der Monate des Bemessungszeitraums gelten (mindestens 7 von 12, §2c Abs. 3 BEEG) – praktisch also rund 7 Monate vor dem Mutterschutz wechseln.' },
      { q: 'Werden die Steuerklassen III und V abgeschafft?', a: 'Stand November 2026 nein: III/V gelten weiter. Der frühere Plan ab 2030 wurde nicht Gesetz, aktuelle Pläne des Finanzministeriums sind nicht beschlossen. IV/IV mit Faktor kann man schon heute wählen.' },
    ],
  },
};

const en = {
  taxClass: {
    heroTitle: 'German tax class chooser for married couples: III/V, IV/IV or factor',
    heroSubtitle: 'Enter two salaries — monthly net for each partner and together, plus the refund or back payment after the tax return. With the 2026 rules.',
    form: {
      title: 'Salaries (2026)',
      grossA: 'Partner A monthly gross',
      grossB: 'Partner B monthly gross',
      grossHint: '0 if no income. A minijob (up to 603 €) has no wage tax.',
      state: 'Federal state',
      children: 'Children',
      church: 'Church tax',
    },
    combo: { factor: 'IV/IV with factor ({{f}})' },
    result: {
      bestMonthly: 'Highest monthly net: {{combo}}',
      annualSame: 'The annual tax is the same for every combination — about {{amount}}. Only the amount withheld during the year differs.',
      tableCaption: 'Comparison of tax class combinations',
      combo: 'Combination',
      netA: 'Net A/month',
      netB: 'Net B/month',
      netTotal: 'Together/month',
      settlement: 'After the return',
      mandatory: 'return required',
      settlementHint: '+ refund, − back payment (estimate; wages only, standard allowances, no child allowances).',
    },
    explain: {
      same: { title: 'The same tax at the end of the year', text: 'Married couples are assessed jointly (income splitting). The tax class only changes the monthly withholding: III/V leaves more net during the year but can lead to a back payment.' },
      risk: { title: 'III/V: risk of a back payment', text: 'With III/V and IV/IV with factor a tax return is compulsory (§46 (2) no. 3a EStG). If the salaries are not far apart, III/V usually withholds too little and the tax office claims the difference — set money aside.' },
      factor: { title: 'IV/IV with factor', text: 'The tax office computes a factor (e.g. 0.962) and multiplies both partners’ class IV wage tax by it. The withholding then matches the annual tax most closely; apply at the tax office, valid for up to two years.' },
      benefits: { title: 'Parental allowance and unemployment benefit', text: 'Elterngeld and unemployment benefit (ALG I) follow the net pay — class III means higher benefits. For Elterngeld the new class must apply in most months of the assessment period, i.e. at least 7 of 12 (§2c (3) BEEG); for ALG I a change during the year counts only in limited cases (§153 SGB III).' },
    },
    reform: {
      title: 'Are III/V being abolished? (as of November 2026)',
      text: 'III/V still apply. The 2024 plan to switch to the factor procedure from 2030 never became law. The Federal Ministry of Finance is again discussing an automatic factor procedure instead of III/V, but no law for 2027 has been passed. We will update the calculator if that changes.',
    },
    actions: { salary: 'Salary calculator', refund: 'Tax refund calculator' },
    disclaimer: 'Simplified estimate: wages and standard allowances only, no child allowances, other income or deductions. The official factor is computed by the tax office. Not tax advice.',
    faq: [
      { q: 'III/V or IV/IV — which is better?', a: 'The annual tax is the same. III/V gives more net during the year when the salaries are far apart (roughly beyond 60/40) but often leads to back payments. For similar salaries IV/IV fits; IV/IV with factor brings the withholding closest to the annual tax.' },
      { q: 'How do we change tax classes?', a: 'With the "Antrag auf Steuerklassenwechsel bei Ehegatten/Lebenspartnern" at the tax office, also online via ELSTER. It is possible several times a year and applies from the following month. For the factor both annual wages are stated.' },
      { q: 'Why is there a back payment with III/V?', a: 'Class V withholds a lot, class III little. If the salary ratio is not close to 60/40, less is withheld in total than the annual tax, and the rest is due with the return. That is why the return is compulsory with III/V.' },
      { q: 'Does the tax class affect Elterngeld?', a: 'Yes, Elterngeld is based on the net pay of the 12 months before the birth, and class III raises it. For the change to count, the new class must apply in most months of the assessment period (at least 7 of 12, §2c (3) BEEG) — in practice switch about 7 months before maternity leave.' },
      { q: 'Will tax classes III and V be abolished?', a: 'As of November 2026, no: III/V still apply. The earlier plan for 2030 did not become law and current ministry plans have not been passed. IV/IV with factor can already be chosen today.' },
    ],
  },
};

const ru = {
  taxClass: {
    heroTitle: 'Выбор налогового класса для супругов: III/V, IV/IV или фактор',
    heroSubtitle: 'Введите две зарплаты — нетто в месяц для каждого и вместе, а также возврат или доплата после декларации. По правилам 2026 года.',
    form: {
      title: 'Зарплаты (2026)',
      grossA: 'Брутто партнёра A в месяц',
      grossB: 'Брутто партнёра B в месяц',
      grossHint: '0, если нет дохода. Миниджоб (до 603 €) без подоходного налога.',
      state: 'Федеральная земля',
      children: 'Дети',
      church: 'Церковный налог',
    },
    combo: { factor: 'IV/IV с фактором ({{f}})' },
    result: {
      bestMonthly: 'Максимальное нетто в месяц: {{combo}}',
      annualSame: 'Годовой налог одинаков для всех вариантов — около {{amount}}. Отличается только то, сколько удерживают в течение года.',
      tableCaption: 'Сравнение комбинаций налоговых классов',
      combo: 'Комбинация',
      netA: 'Нетто A/мес.',
      netB: 'Нетто B/мес.',
      netTotal: 'Вместе/мес.',
      settlement: 'После декларации',
      mandatory: 'декларация обязательна',
      settlementHint: '+ возврат, − доплата (оценка; только зарплата, стандартные вычеты, без детских вычетов).',
    },
    explain: {
      same: { title: 'В конце года налог одинаков', text: 'Супруги подают совместную декларацию (Ehegattensplitting). Налоговый класс меняет только ежемесячное удержание: с III/V в течение года больше нетто, но в конце года возможна доплата.' },
      risk: { title: 'III/V: риск доплаты', text: 'При III/V и IV/IV с фактором декларация обязательна (§46 абз. 2 № 3a EStG). Если зарплаты не сильно различаются, при III/V обычно удерживается слишком мало, и Finanzamt требует доплату — откладывайте деньги.' },
      factor: { title: 'IV/IV с фактором', text: 'Finanzamt рассчитывает фактор (например, 0,962) и умножает на него налог IV класса обоих партнёров. Так удержание ближе всего к годовому налогу; заявление в Finanzamt, действует до двух лет.' },
      benefits: { title: 'Elterngeld и пособие по безработице', text: 'Elterngeld и пособие по безработице (ALG I) зависят от нетто — класс III даёт более высокие выплаты. Для Elterngeld новый класс должен действовать в большинстве месяцев расчётного периода, то есть минимум 7 из 12 (§2c абз. 3 BEEG); для ALG I смена в текущем году учитывается лишь ограниченно (§153 SGB III).' },
    },
    reform: {
      title: 'Отменят ли III/V? (ноябрь 2026)',
      text: 'Сейчас III/V действуют. Запланированный в 2024 году переход на фактор с 2030 года не стал законом. Минфин снова обсуждает автоматический фактор вместо III/V, но принятого закона на 2027 год нет. Если что-то изменится, мы обновим калькулятор.',
    },
    actions: { salary: 'Калькулятор зарплаты', refund: 'Возврат налога' },
    disclaimer: 'Упрощённая оценка: только зарплата и стандартные вычеты, без детских вычетов, других доходов и расходов. Официальный фактор рассчитывает Finanzamt. Не налоговая консультация.',
    faq: [
      { q: 'III/V или IV/IV — что выгоднее?', a: 'Годовой налог одинаков. III/V даёт больше нетто в течение года, если зарплаты сильно различаются (примерно больше 60/40), но часто приводит к доплате. При похожих зарплатах подходит IV/IV; IV/IV с фактором ближе всего к годовому налогу.' },
      { q: 'Как сменить налоговый класс?', a: 'Заявлением «Antrag auf Steuerklassenwechsel bei Ehegatten/Lebenspartnern» в Finanzamt, также онлайн через ELSTER. Это можно делать несколько раз в год; смена действует со следующего месяца. Для фактора указываются обе годовые зарплаты.' },
      { q: 'Почему при III/V бывает доплата?', a: 'Класс V удерживает много, класс III мало. Если соотношение зарплат не близко к 60/40, вместе удерживается меньше годового налога, и остаток надо доплатить по декларации. Поэтому при III/V декларация обязательна.' },
      { q: 'Влияет ли налоговый класс на Elterngeld?', a: 'Да, Elterngeld считается от нетто за 12 месяцев до рождения ребёнка, и класс III его повышает. Чтобы смена учитывалась, новый класс должен действовать в большинстве месяцев расчётного периода (минимум 7 из 12, §2c абз. 3 BEEG) — на практике меняйте примерно за 7 месяцев до декрета.' },
      { q: 'Отменят ли классы III и V?', a: 'По состоянию на ноябрь 2026 года — нет: III/V действуют. Прежний план на 2030 год не стал законом, текущие планы Минфина не приняты. IV/IV с фактором можно выбрать уже сейчас.' },
    ],
  },
};

const tr = {
  taxClass: {
    heroTitle: 'Evli çiftler için vergi sınıfı seçimi: III/V, IV/IV veya faktör',
    heroSubtitle: 'İki maaşı girin — her eşin ve birlikte aylık net geliri, beyannameden sonra iade veya ek ödeme. 2026 kurallarıyla.',
    form: {
      title: 'Maaşlar (2026)',
      grossA: 'A eşinin aylık brüt maaşı',
      grossB: 'B eşinin aylık brüt maaşı',
      grossHint: 'Geliri yoksa 0 yazın. Mini iş (603 €’ya kadar) gelir vergisiz.',
      state: 'Eyalet',
      children: 'Çocuklar',
      church: 'Kilise vergisi',
    },
    combo: { factor: 'Faktörlü IV/IV ({{f}})' },
    result: {
      bestMonthly: 'En yüksek aylık net: {{combo}}',
      annualSame: 'Yıllık vergi tüm kombinasyonlarda aynıdır — yaklaşık {{amount}}. Fark yalnız yıl içinde ne kadar kesildiğindedir.',
      tableCaption: 'Vergi sınıfı kombinasyonlarının karşılaştırması',
      combo: 'Kombinasyon',
      netA: 'Net A/ay',
      netB: 'Net B/ay',
      netTotal: 'Birlikte/ay',
      settlement: 'Beyannameden sonra',
      mandatory: 'beyanname zorunlu',
      settlementHint: '+ iade, − ek ödeme (tahmini; yalnız maaş, standart indirimler, çocuk indirimi yok).',
    },
    explain: {
      same: { title: 'Yıl sonunda vergi aynı', text: 'Evli çiftler birlikte beyan verir (Ehegattensplitting). Vergi sınıfı yalnız aylık kesintiyi değiştirir: III/V’de yıl içinde daha fazla net kalır ama yıl sonunda ek ödeme çıkabilir.' },
      risk: { title: 'III/V: ek ödeme riski', text: 'III/V ve faktörlü IV/IV’de beyanname zorunludur (§46 f. 2 no. 3a EStG). Maaşlar çok farklı değilse III/V genellikle az vergi keser ve Finanzamt farkı ister — para ayırın.' },
      factor: { title: 'Faktörlü IV/IV', text: 'Finanzamt bir faktör (ör. 0,962) hesaplar ve iki eşin IV. sınıf vergisini bununla çarpar. Böylece kesinti yıllık vergiye en yakın olur; Finanzamt’a başvurulur, iki yıla kadar geçerlidir.' },
      benefits: { title: 'Elterngeld ve işsizlik parası', text: 'Elterngeld ve işsizlik parası (ALG I) net maaşa göre hesaplanır — III. sınıf daha yüksek ödeme sağlar. Elterngeld için yeni sınıf hesaplama döneminin aylarının çoğunda, yani 12 ayın en az 7’sinde geçerli olmalıdır (§2c f. 3 BEEG); ALG I için yıl içindeki değişiklik yalnız sınırlı durumlarda sayılır (§153 SGB III).' },
    },
    reform: {
      title: 'III/V kaldırılıyor mu? (Kasım 2026)',
      text: 'Şu anda III/V geçerlidir. 2024’te 2030’dan itibaren faktöre geçiş planlanmıştı ama yasalaşmadı. Federal Maliye Bakanlığı III/V yerine otomatik faktör yöntemini yeniden tartışıyor, ancak 2027 için kabul edilmiş bir yasa yok. Değişirse hesaplayıcıyı güncelleyeceğiz.',
    },
    actions: { salary: 'Maaş hesaplayıcı', refund: 'Vergi iadesi' },
    disclaimer: 'Basitleştirilmiş tahmin: yalnız maaş ve standart indirimler; çocuk indirimi, diğer gelirler ve giderler yok. Resmî faktörü Finanzamt hesaplar. Vergi danışmanlığı değildir.',
    faq: [
      { q: 'III/V mi IV/IV mı — hangisi daha avantajlı?', a: 'Yıllık vergi aynıdır. Maaşlar çok farklıysa (yaklaşık 60/40’tan fazla) III/V yıl içinde daha fazla net verir ama çoğu zaman ek ödeme doğurur. Benzer maaşlarda IV/IV uygundur; faktörlü IV/IV kesintiyi yıllık vergiye en çok yaklaştırır.' },
      { q: 'Vergi sınıfı nasıl değiştirilir?', a: 'Finanzamt’a “Antrag auf Steuerklassenwechsel bei Ehegatten/Lebenspartnern” ile, ELSTER üzerinden çevrim içi de. Yılda birkaç kez mümkündür; değişiklik bir sonraki aydan itibaren geçerlidir. Faktör için iki yıllık maaş da belirtilir.' },
      { q: 'III/V’de neden ek ödeme çıkar?', a: 'V. sınıf çok, III. sınıf az vergi keser. Maaş oranı 60/40’a yakın değilse toplam kesinti yıllık vergiden az olur ve kalan kısım beyannameyle ödenir. Bu yüzden III/V’de beyanname zorunludur.' },
      { q: 'Vergi sınıfı Elterngeld’i etkiler mi?', a: 'Evet, Elterngeld doğumdan önceki 12 ayın net maaşına göre hesaplanır ve III. sınıf bunu artırır. Değişikliğin sayılması için yeni sınıf hesaplama döneminin aylarının çoğunda (12 ayın en az 7’sinde) geçerli olmalıdır (§2c f. 3 BEEG) — pratikte annelik izninden yaklaşık 7 ay önce değiştirin.' },
      { q: 'III ve V vergi sınıfları kaldırılacak mı?', a: 'Kasım 2026 itibarıyla hayır: III/V geçerli. 2030 için önceki plan yasalaşmadı, bakanlığın güncel planları da kabul edilmedi. Faktörlü IV/IV bugün de seçilebilir.' },
    ],
  },
};

const uk = {
  taxClass: {
    heroTitle: 'Вибір податкового класу для подружжя: III/V, IV/IV чи фактор',
    heroSubtitle: 'Введіть дві зарплати — нетто на місяць для кожного й разом, а також повернення чи доплата після декларації. За правилами 2026 року.',
    form: {
      title: 'Зарплати (2026)',
      grossA: 'Брутто партнера A на місяць',
      grossB: 'Брутто партнера B на місяць',
      grossHint: '0, якщо немає доходу. Мініджоб (до 603 €) без податку на зарплату.',
      state: 'Федеральна земля',
      children: 'Діти',
      church: 'Церковний податок',
    },
    combo: { factor: 'IV/IV з фактором ({{f}})' },
    result: {
      bestMonthly: 'Найвище нетто на місяць: {{combo}}',
      annualSame: 'Річний податок однаковий для всіх варіантів — близько {{amount}}. Відрізняється лише те, скільки утримують протягом року.',
      tableCaption: 'Порівняння комбінацій податкових класів',
      combo: 'Комбінація',
      netA: 'Нетто A/міс.',
      netB: 'Нетто B/міс.',
      netTotal: 'Разом/міс.',
      settlement: 'Після декларації',
      mandatory: 'декларація обовʼязкова',
      settlementHint: '+ повернення, − доплата (оцінка; лише зарплата, стандартні відрахування, без дитячих відрахувань).',
    },
    explain: {
      same: { title: 'Наприкінці року податок однаковий', text: 'Подружжя подає спільну декларацію (Ehegattensplitting). Податковий клас змінює лише щомісячне утримання: з III/V протягом року більше нетто, але наприкінці року можлива доплата.' },
      risk: { title: 'III/V: ризик доплати', text: 'При III/V та IV/IV з фактором декларація обовʼязкова (§46 абз. 2 № 3a EStG). Якщо зарплати не дуже різняться, при III/V зазвичай утримують замало, і Finanzamt вимагає доплату — відкладайте гроші.' },
      factor: { title: 'IV/IV з фактором', text: 'Finanzamt розраховує фактор (наприклад, 0,962) і множить на нього податок IV класу обох партнерів. Так утримання найближче до річного податку; заява до Finanzamt, діє до двох років.' },
      benefits: { title: 'Elterngeld і допомога з безробіття', text: 'Elterngeld і допомога з безробіття (ALG I) залежать від нетто — клас III дає вищі виплати. Для Elterngeld новий клас має діяти в більшості місяців розрахункового періоду, тобто щонайменше 7 з 12 (§2c абз. 3 BEEG); для ALG I зміна в поточному році враховується лише обмежено (§153 SGB III).' },
    },
    reform: {
      title: 'Чи скасують III/V? (листопад 2026)',
      text: 'Нині III/V діють. Запланований у 2024 році перехід на фактор з 2030 року не став законом. Мінфін знову обговорює автоматичний фактор замість III/V, але ухваленого закону на 2027 рік немає. Якщо це зміниться, ми оновимо калькулятор.',
    },
    actions: { salary: 'Калькулятор зарплати', refund: 'Повернення податку' },
    disclaimer: 'Спрощена оцінка: лише зарплата й стандартні відрахування, без дитячих відрахувань, інших доходів і витрат. Офіційний фактор розраховує Finanzamt. Не податкова консультація.',
    faq: [
      { q: 'III/V чи IV/IV — що вигідніше?', a: 'Річний податок однаковий. III/V дає більше нетто протягом року, якщо зарплати дуже різняться (приблизно понад 60/40), але часто призводить до доплати. За схожих зарплат підходить IV/IV; IV/IV з фактором найближче до річного податку.' },
      { q: 'Як змінити податковий клас?', a: 'Заявою «Antrag auf Steuerklassenwechsel bei Ehegatten/Lebenspartnern» до Finanzamt, також онлайн через ELSTER. Це можна робити кілька разів на рік; зміна діє з наступного місяця. Для фактора вказують обидві річні зарплати.' },
      { q: 'Чому при III/V буває доплата?', a: 'Клас V утримує багато, клас III мало. Якщо співвідношення зарплат не близьке до 60/40, разом утримується менше за річний податок, і решту треба доплатити за декларацією. Тому при III/V декларація обовʼязкова.' },
      { q: 'Чи впливає податковий клас на Elterngeld?', a: 'Так, Elterngeld рахують від нетто за 12 місяців до народження дитини, і клас III його підвищує. Щоб зміна врахувалася, новий клас має діяти в більшості місяців розрахункового періоду (щонайменше 7 з 12, §2c абз. 3 BEEG) — на практиці змінюйте приблизно за 7 місяців до декретної відпустки.' },
      { q: 'Чи скасують класи III і V?', a: 'Станом на листопад 2026 року — ні: III/V діють. Попередній план на 2030 рік не став законом, поточні плани Мінфіну не ухвалені. IV/IV з фактором можна обрати вже зараз.' },
    ],
  },
};

export const pagesTaxClass = { az, de, en, ru, tr, uk };

// Client cabinet after the visa decision: full-screen "visa granted" celebration, the "first 30 days in Germany"
// checklist and the "My Germany" city card. Registered with registerCopy(pagesFirstWeeks).

const az = {
  fw: {
    celebrate: {
      headline: 'Uğurlar, {{city}} sizi gözləyir!',
      headlineNoCity: 'Uğurlar, Almaniya sizi gözləyir!',
      sub: 'Vizanız təsdiqləndi. Yeni həyatınız başlayır.',
      next: 'Davam',
      close: 'Bağla',
    },
    first30: {
      title: 'Almaniyada ilk 30 gün',
      sub: 'Gəldikdən sonra ilk işlər. Bitirdiyinizi qeyd edin.',
      progress: '{{done}} / {{total}} tamamlandı',
      map: 'Xəritədə axtar',
      mapIn: 'Xəritədə axtar: {{city}}',
      note: 'Qaydalar şəhərə görə fərqlənə bilər. Dəqiq tələbləri idarənin öz saytında yoxlayın.',
      readOnly: 'Müştəri görünüşü: qeydlər dəyişdirilmir.',
      items: {
        anmeldung: { title: 'Anmeldung (ünvan qeydiyyatı)', how: 'Köçdükdən sonra 14 gün ərzində Bürgeramt-da (vətəndaş xidməti) qeydiyyatdan keçin. Pasport, icarə müqaviləsi və ev sahibinin təsdiqi (Wohnungsgeberbestätigung) lazımdır. Sonda Meldebescheinigung (qeydiyyat arayışı) alırsınız.' },
        bank: { title: 'Bank hesabı', how: 'Maaş bu hesaba köçürülür. Pasport və Meldebescheinigung ilə hesab açın. Bir çox bank hesabı onlayn da açır.' },
        krankenkasse: { title: 'Krankenkasse (səhiyyə sığortası)', how: 'Sığorta məcburidir. Sığorta şirkətini seçin və qeydiyyatdan keçin. Sığorta kartı poçtla gəlir.' },
        steuerid: { title: 'Steuer-ID (vergi nömrəsi)', how: 'Anmeldung-dan bir neçə həftə sonra poçtla gəlir. Nömrəni işəgötürənə verin.' },
        rente: { title: 'Rentenversicherungsnummer (pensiya sığortası nömrəsi)', how: 'İşəgötürən sizin üçün sorğu göndərir və nömrə poçtla gəlir. Gəlməsə, Deutsche Rentenversicherung-a yazın.' },
        sim: { title: 'SIM kart və yerli nömrə', how: 'Operator mağazasında pasportla alın. Bəzən ünvan qeydiyyatı da lazım olur.' },
        aufenthalt: { title: 'Yaşayış kartı (eAT)', how: 'Ausländerbehörde-də (miqrasiya idarəsi) biometrik məlumatlar verilir. Görüş qaydasını idarənin saytında yoxlayın.' },
      },
    },
    myde: {
      title: 'Mənim Almaniyam: {{city}}',
      sub: 'Şəhərinizlə tanış olun.',
      weather: 'İndi hava',
      weatherNone: 'Hava məlumatı hazırda alınmadı.',
      time: 'Saat fərqi',
      timeValue: 'Almaniya Bakıdan {{h}} saat geridir',
      timeSame: 'Bakı ilə eyni saat',
      flight: 'Bakıdan düz uçuş',
      flightValue: 'təxminən {{time}}',
      flightNote: 'Təxmini hesab: düz xətt məsafəsi təxminən {{km}} km. Real uçuş vaxtı aviaşirkətdən asılıdır.',
      hm: '{{h}} saat {{m}} dəq',
      community: 'Azərbaycan icması və restoranlar',
      communityHint: 'Xəritədə axtarış açılır',
    },
  },
};

type Copy = typeof az;

const de: Copy = {
  fw: {
    celebrate: {
      headline: 'Viel Erfolg – {{city}} erwartet Sie!',
      headlineNoCity: 'Viel Erfolg – Deutschland erwartet Sie!',
      sub: 'Ihr Visum ist genehmigt. Ihr neues Leben beginnt.',
      next: 'Weiter',
      close: 'Schließen',
    },
    first30: {
      title: 'Die ersten 30 Tage in Deutschland',
      sub: 'Die ersten Erledigungen nach der Ankunft. Haken Sie ab, was Sie geschafft haben.',
      progress: '{{done}} / {{total}} erledigt',
      map: 'Auf der Karte suchen',
      mapIn: 'Auf der Karte suchen: {{city}}',
      note: 'Die Regeln können je nach Stadt abweichen. Prüfen Sie die genauen Anforderungen auf der Seite der Behörde.',
      readOnly: 'Kundenansicht: Häkchen werden nicht geändert.',
      items: {
        anmeldung: { title: 'Anmeldung (Wohnsitz)', how: 'Innerhalb von 14 Tagen nach dem Einzug im Bürgeramt anmelden. Sie brauchen Pass, Mietvertrag und die Wohnungsgeberbestätigung. Danach erhalten Sie die Meldebescheinigung.' },
        bank: { title: 'Bankkonto', how: 'Das Gehalt wird auf dieses Konto überwiesen. Eröffnen Sie es mit Pass und Meldebescheinigung. Viele Banken eröffnen das Konto auch online.' },
        krankenkasse: { title: 'Krankenkasse', how: 'Die Krankenversicherung ist Pflicht. Wählen Sie eine Kasse und melden Sie sich an. Die Gesundheitskarte kommt per Post.' },
        steuerid: { title: 'Steuer-ID', how: 'Sie kommt einige Wochen nach der Anmeldung per Post. Geben Sie die Nummer Ihrem Arbeitgeber.' },
        rente: { title: 'Rentenversicherungsnummer', how: 'Der Arbeitgeber beantragt sie für Sie, die Nummer kommt per Post. Kommt nichts, schreiben Sie an die Deutsche Rentenversicherung.' },
        sim: { title: 'SIM-Karte und deutsche Nummer', how: 'Im Mobilfunk-Shop mit Pass kaufen. Manchmal wird auch die Anmeldung verlangt.' },
        aufenthalt: { title: 'Aufenthaltstitel (eAT)', how: 'Bei der Ausländerbehörde werden die biometrischen Daten abgenommen. Prüfen Sie auf der Seite der Behörde, wie der Termin läuft.' },
      },
    },
    myde: {
      title: 'Mein Deutschland: {{city}}',
      sub: 'Lernen Sie Ihre Stadt kennen.',
      weather: 'Wetter jetzt',
      weatherNone: 'Die Wetterdaten sind gerade nicht verfügbar.',
      time: 'Zeitunterschied',
      timeValue: 'Deutschland ist {{h}} Std. hinter Baku',
      timeSame: 'Gleiche Uhrzeit wie in Baku',
      flight: 'Direktflug ab Baku',
      flightValue: 'ca. {{time}}',
      flightNote: 'Grobe Schätzung: Luftlinie etwa {{km}} km. Die echte Flugzeit hängt von der Fluggesellschaft ab.',
      hm: '{{h}} Std. {{m}} Min.',
      community: 'Aserbaidschanische Community und Restaurants',
      communityHint: 'Öffnet eine Kartensuche',
    },
  },
};

const en: Copy = {
  fw: {
    celebrate: {
      headline: 'Good luck – {{city}} is waiting for you!',
      headlineNoCity: 'Good luck – Germany is waiting for you!',
      sub: 'Your visa is approved. Your new life begins.',
      next: 'Continue',
      close: 'Close',
    },
    first30: {
      title: 'Your first 30 days in Germany',
      sub: 'The first things to do after you arrive. Tick off what you have done.',
      progress: '{{done}} / {{total}} done',
      map: 'Search on the map',
      mapIn: 'Search on the map: {{city}}',
      note: 'Rules can differ from city to city. Check the exact requirements on the office’s own website.',
      readOnly: 'Client view: ticks are not changed.',
      items: {
        anmeldung: { title: 'Anmeldung (address registration)', how: 'Register at the Bürgeramt within 14 days of moving in. You need your passport, rental contract and the landlord’s confirmation (Wohnungsgeberbestätigung). You then get the Meldebescheinigung.' },
        bank: { title: 'Bank account', how: 'Your salary is paid into this account. Open it with your passport and Meldebescheinigung. Many banks also open accounts online.' },
        krankenkasse: { title: 'Krankenkasse (health insurance)', how: 'Health insurance is compulsory. Choose an insurer and sign up. The insurance card arrives by post.' },
        steuerid: { title: 'Steuer-ID (tax ID)', how: 'It arrives by post a few weeks after your Anmeldung. Give the number to your employer.' },
        rente: { title: 'Rentenversicherungsnummer (pension insurance number)', how: 'Your employer requests it for you and the number comes by post. If nothing arrives, write to the Deutsche Rentenversicherung.' },
        sim: { title: 'SIM card and German number', how: 'Buy it in a mobile shop with your passport. Sometimes your address registration is needed too.' },
        aufenthalt: { title: 'Residence card (eAT)', how: 'Your biometric data is taken at the Ausländerbehörde (immigration office). Check the office’s website for how appointments work.' },
      },
    },
    myde: {
      title: 'My Germany: {{city}}',
      sub: 'Get to know your city.',
      weather: 'Weather now',
      weatherNone: 'Weather data is not available right now.',
      time: 'Time difference',
      timeValue: 'Germany is {{h}} h behind Baku',
      timeSame: 'Same time as Baku',
      flight: 'Direct flight from Baku',
      flightValue: 'about {{time}}',
      flightNote: 'Rough estimate: about {{km}} km in a straight line. The real flight time depends on the airline.',
      hm: '{{h}} h {{m}} min',
      community: 'Azerbaijani community and restaurants',
      communityHint: 'Opens a map search',
    },
  },
};

const ru: Copy = {
  fw: {
    celebrate: {
      headline: 'Удачи, {{city}} ждёт вас!',
      headlineNoCity: 'Удачи, Германия ждёт вас!',
      sub: 'Ваша виза одобрена. Начинается новая жизнь.',
      next: 'Продолжить',
      close: 'Закрыть',
    },
    first30: {
      title: 'Первые 30 дней в Германии',
      sub: 'Первые дела после приезда. Отмечайте то, что уже сделали.',
      progress: 'Готово: {{done}} из {{total}}',
      map: 'Найти на карте',
      mapIn: 'Найти на карте: {{city}}',
      note: 'Правила могут отличаться в разных городах. Точные требования смотрите на сайте самого ведомства.',
      readOnly: 'Режим просмотра клиента: отметки не меняются.',
      items: {
        anmeldung: { title: 'Anmeldung (регистрация по адресу)', how: 'В течение 14 дней после переезда зарегистрируйтесь в Bürgeramt. Нужны паспорт, договор аренды и подтверждение от арендодателя (Wohnungsgeberbestätigung). Затем вы получите Meldebescheinigung.' },
        bank: { title: 'Банковский счёт', how: 'Зарплата приходит на этот счёт. Откройте его с паспортом и Meldebescheinigung. Многие банки открывают счёт и онлайн.' },
        krankenkasse: { title: 'Krankenkasse (медицинская страховка)', how: 'Страховка обязательна. Выберите страховую кассу и оформитесь. Карта придёт по почте.' },
        steuerid: { title: 'Steuer-ID (налоговый номер)', how: 'Приходит по почте через несколько недель после Anmeldung. Передайте номер работодателю.' },
        rente: { title: 'Rentenversicherungsnummer (номер пенсионного страхования)', how: 'Работодатель запрашивает его за вас, номер приходит по почте. Если не пришёл, напишите в Deutsche Rentenversicherung.' },
        sim: { title: 'SIM-карта и немецкий номер', how: 'Купите в салоне оператора с паспортом. Иногда нужна и регистрация по адресу.' },
        aufenthalt: { title: 'Карта проживания (eAT)', how: 'В Ausländerbehörde (миграционная служба) снимают биометрические данные. Как записаться, смотрите на сайте ведомства.' },
      },
    },
    myde: {
      title: 'Моя Германия: {{city}}',
      sub: 'Познакомьтесь со своим городом.',
      weather: 'Погода сейчас',
      weatherNone: 'Данные о погоде сейчас недоступны.',
      time: 'Разница во времени',
      timeValue: 'Германия отстаёт от Баку на {{h}} ч',
      timeSame: 'Время как в Баку',
      flight: 'Прямой перелёт из Баку',
      flightValue: 'примерно {{time}}',
      flightNote: 'Приблизительная оценка: около {{km}} км по прямой. Реальное время полёта зависит от авиакомпании.',
      hm: '{{h}} ч {{m}} мин',
      community: 'Азербайджанская община и рестораны',
      communityHint: 'Открывает поиск на карте',
    },
  },
};

export const pagesFirstWeeks = { az, de, en, ru };

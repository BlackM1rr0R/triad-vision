// Copy of the first-login tours added on top of pagesPortalUx (pux.tour.*): the staff tour of the admin area
// (components/onboarding/tours.ts ADMIN_TOUR) and the journey-map step of the client tour. Merged deep into the
// same `pux.tour` namespace by registerCopy (TourHost).

const az = {
  pux: {
    tour: {
      start: 'Turu başlat',
      client: {
        journey: { title: 'Səyahət xəritəsi', text: 'Almaniyaya gedən yolunuz bir xəritədə: keçdiyiniz mərhələlər, indi harada olduğunuz və qarşıda nələrin olduğu.' },
      },
      admin: {
        myday: { title: 'Bu günüm', text: 'Gününüz buradan başlayır: bu gün nə vacibdir, kim cavab gözləyir və hansı müddətlər yaxınlaşır.' },
        cmdk: { title: 'Hər şeyi tapın: Ctrl+K', text: 'Ctrl+K (Mac-da ⌘K) və ya / ilə axtarışı açın: müştəri, iş, səhifə və ya əmr — adın bir hissəsini yazmaq kifayətdir.' },
        cases: { title: 'Müraciətlər', text: 'Sətrə klikləyin — iş səhifəni tərk etmədən yan paneldə açılır. Paneldəki oxlarla növbəti işə keçin, Esc ilə bağlayın.' },
        review: { title: 'Yoxlama rejimi', text: 'Yüklənmiş sənədlər bir növbədə: baxın, qəbul edin və ya səbəb yazıb geri qaytarın. J / K — növbəti / əvvəlki, A — qəbul, R — geri qaytar.' },
        drive: { title: 'Disk', text: 'Komanda sənədləri, müştəri qovluqları və şablonlar Diskdədir. İş sahəsinin öz qısa turu da var.' },
        help: { title: 'Kömək', text: 'Hər səhifənin təlimatı buradadır. Bu turu da istənilən vaxt buradan yenidən başlada bilərsiniz.' },
      },
    },
  },
};

const de: typeof az = {
  pux: {
    tour: {
      start: 'Tour starten',
      client: {
        journey: { title: 'Reisekarte', text: 'Ihr ganzer Weg nach Deutschland auf einer Karte: geschaffte Etappen, wo Sie gerade stehen und was noch vor Ihnen liegt.' },
      },
      admin: {
        myday: { title: 'Mein Tag', text: 'Hier beginnt Ihr Tag: was heute wichtig ist, wer auf eine Antwort wartet und welche Fristen näher rücken.' },
        cmdk: { title: 'Alles finden: Strg+K', text: 'Mit Strg+K (Mac: ⌘K) oder / öffnen Sie die Suche: Kunde, Fall, Seite oder Befehl — ein Teil des Namens genügt.' },
        cases: { title: 'Anträge', text: 'Klicken Sie auf eine Zeile — der Fall öffnet sich im Seitenpanel, ohne die Liste zu verlassen. Mit den Pfeilen im Panel zum nächsten Fall, Esc schließt.' },
        review: { title: 'Prüfmodus', text: 'Hochgeladene Dokumente in einer Warteschlange: ansehen, annehmen oder mit Begründung zurückgeben. J / K — nächstes / voriges, A — annehmen, R — zurückgeben.' },
        drive: { title: 'Drive', text: 'Teamdokumente, Kundenordner und Vorlagen liegen im Drive. Der Arbeitsbereich hat eine eigene kurze Tour.' },
        help: { title: 'Hilfe', text: 'Hier finden Sie die Anleitung zu jeder Seite. Auch diese Tour können Sie hier jederzeit neu starten.' },
      },
    },
  },
};

const en: typeof az = {
  pux: {
    tour: {
      start: 'Start the tour',
      client: {
        journey: { title: 'Journey map', text: 'Your whole way to Germany on one map: the stages you have completed, where you are now and what is ahead.' },
      },
      admin: {
        myday: { title: 'My day', text: 'Your day starts here: what matters today, who is waiting for a reply and which deadlines are coming up.' },
        cmdk: { title: 'Find anything: Ctrl+K', text: 'Press Ctrl+K (⌘K on a Mac) or / to search: a client, a case, a page or a command — part of the name is enough.' },
        cases: { title: 'Cases', text: 'Click a row — the case opens in a side panel without leaving the list. Use the arrows in the panel for the next case, Esc closes it.' },
        review: { title: 'Review mode', text: 'Uploaded documents in one queue: look, accept or send back with a reason. J / K — next / previous, A — accept, R — send back.' },
        drive: { title: 'Drive', text: 'Team documents, client folders and templates live in Drive. The workspace has its own short tour.' },
        help: { title: 'Help', text: 'The guide for every page is here. You can also restart this tour from here at any time.' },
      },
    },
  },
};

const ru: typeof az = {
  pux: {
    tour: {
      start: 'Начать тур',
      client: {
        journey: { title: 'Карта пути', text: 'Весь ваш путь в Германию на одной карте: пройденные этапы, где вы сейчас и что впереди.' },
      },
      admin: {
        myday: { title: 'Мой день', text: 'Здесь начинается ваш день: что важно сегодня, кто ждёт ответа и какие сроки приближаются.' },
        cmdk: { title: 'Найти всё: Ctrl+K', text: 'Ctrl+K (на Mac ⌘K) или / открывает поиск: клиент, дело, страница или команда — достаточно части названия.' },
        cases: { title: 'Заявки', text: 'Нажмите на строку — дело откроется в боковой панели, не покидая списка. Стрелками в панели — к следующему делу, Esc закрывает.' },
        review: { title: 'Режим проверки', text: 'Загруженные документы в одной очереди: просмотрите, примите или верните с причиной. J / K — следующий / предыдущий, A — принять, R — вернуть.' },
        drive: { title: 'Диск', text: 'Документы команды, папки клиентов и шаблоны — на Диске. У рабочего пространства есть свой короткий тур.' },
        help: { title: 'Помощь', text: 'Здесь инструкция к каждой странице. Этот тур тоже можно в любой момент перезапустить отсюда.' },
      },
    },
  },
};

const tr: typeof az = {
  pux: {
    tour: {
      start: 'Turu başlat',
      client: {
        journey: { title: 'Yolculuk haritası', text: 'Almanya yolunuzun tamamı tek bir haritada: geçtiğiniz aşamalar, şu an nerede olduğunuz ve sizi neyin beklediği.' },
      },
      admin: {
        myday: { title: 'Günüm', text: 'Gününüz burada başlar: bugün ne önemli, kim yanıt bekliyor ve hangi süreler yaklaşıyor.' },
        cmdk: { title: 'Her şeyi bulun: Ctrl+K', text: 'Aramayı Ctrl+K (Mac’te ⌘K) veya / ile açın: müşteri, dosya, sayfa veya komut — adın bir kısmı yeterli.' },
        cases: { title: 'Başvurular', text: 'Bir satıra tıklayın — dosya listeden çıkmadan yan panelde açılır. Paneldeki oklarla sonraki dosyaya geçin, Esc kapatır.' },
        review: { title: 'İnceleme modu', text: 'Yüklenen belgeler tek bir kuyrukta: inceleyin, kabul edin veya gerekçeyle geri gönderin. J / K — sonraki / önceki, A — kabul, R — geri gönder.' },
        drive: { title: 'Drive', text: 'Ekip belgeleri, müşteri klasörleri ve şablonlar Drive’da. Çalışma alanının kendi kısa turu var.' },
        help: { title: 'Yardım', text: 'Her sayfanın kılavuzu burada. Bu turu da istediğiniz zaman buradan yeniden başlatabilirsiniz.' },
      },
    },
  },
};

const uk: typeof az = {
  pux: {
    tour: {
      start: 'Почати тур',
      client: {
        journey: { title: 'Карта шляху', text: 'Весь ваш шлях до Німеччини на одній карті: пройдені етапи, де ви зараз і що попереду.' },
      },
      admin: {
        myday: { title: 'Мій день', text: 'Тут починається ваш день: що важливо сьогодні, хто чекає на відповідь і які строки наближаються.' },
        cmdk: { title: 'Знайти все: Ctrl+K', text: 'Ctrl+K (на Mac ⌘K) або / відкриває пошук: клієнт, справа, сторінка чи команда — достатньо частини назви.' },
        cases: { title: 'Заявки', text: 'Натисніть на рядок — справа відкриється в бічній панелі, не залишаючи списку. Стрілками в панелі — до наступної справи, Esc закриває.' },
        review: { title: 'Режим перевірки', text: 'Завантажені документи в одній черзі: перегляньте, прийміть або поверніть із причиною. J / K — наступний / попередній, A — прийняти, R — повернути.' },
        drive: { title: 'Диск', text: 'Документи команди, папки клієнтів і шаблони — на Диску. Робочий простір має власний короткий тур.' },
        help: { title: 'Допомога', text: 'Тут інструкція до кожної сторінки. Цей тур також можна будь-коли перезапустити звідси.' },
      },
    },
  },
};

export const pagesTours = { az, de, en, ru, tr, uk };

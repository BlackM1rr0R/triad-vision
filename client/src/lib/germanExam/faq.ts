/**
 * FAQ of the German mock exam and the level self-assessment, shown on the pages and sent as FAQPage JSON-LD by
 * the server (server/src/lib/germanExam/faq.ts is an exact copy; server/tests/unit/germanExamFaq.test.ts checks
 * that both agree). No imports: plain data.
 */
type Lang = 'az' | 'de' | 'en' | 'ru' | 'tr' | 'uk';
export type FaqItem = { q: string; a: string };

export const MOCK_EXAM_FAQ: Record<Lang, FaqItem[]> = {
  az: [
    {
      q: 'Bu, rəsmi Goethe imtahanıdır?',
      a: 'Xeyr. Bu, Triad Vision-un pulsuz və müstəqil sınaq testidir: Goethe-Zertifikat A1 (Start Deutsch 1) və B1 imtahanlarının açıq təsvir olunmuş quruluşuna uyğun hazırlanıb, bütün mətnlər və tapşırıqlar bizimdir. Goethe-Institut ilə əlaqəmiz yoxdur. Rəsmi imtahanı yalnız Goethe-Institut və ya lisenziyalı imtahan mərkəzində vermək olar.',
    },
    {
      q: 'Nəticə necə hesablanır?',
      a: 'Dinləmə və oxu avtomatik yoxlanılır. Yazı və danışıq üçün nümunə cavabla müqayisə edib meyar siyahısını özünüz işarələyirsiniz. A1: cəmi 100 baldan 60 bal keçid. B1: hər modul 100 baldan, hər modulda 60 bal keçid — Goethe-Institut-un dərc etdiyi qaydalara uyğun (sentyabr 2023).',
    },
    {
      q: 'Səs yazım və cavablarım haradasa saxlanılır?',
      a: 'Danışıq yazısı yalnız brauzerinizin yaddaşında qalır və səhifədən çıxanda silinir. Cavablarınız yalnız bu cihazda (brauzerin local storage-də) saxlanılır, heç nə serverə göndərilmir.',
    },
  ],
  de: [
    {
      q: 'Ist das die offizielle Goethe-Prüfung?',
      a: 'Nein. Das ist ein kostenloser, unabhängiger Übungstest von Triad Vision, aufgebaut wie die öffentlich beschriebenen Prüfungen Goethe-Zertifikat A1 (Start Deutsch 1) und B1. Alle Texte und Aufgaben sind selbst geschrieben; wir sind nicht mit dem Goethe-Institut verbunden. Die echte Prüfung legen Sie nur beim Goethe-Institut oder einem lizenzierten Prüfungszentrum ab.',
    },
    {
      q: 'Wie wird der Test bewertet?',
      a: 'Hören und Lesen werden automatisch ausgewertet. Schreiben und Sprechen vergleichen Sie mit der Musterlösung und haken eine Checkliste ab. A1: insgesamt höchstens 100 Punkte, bestanden ab 60. B1: jedes Modul höchstens 100 Punkte, bestanden ab 60 pro Modul – nach den veröffentlichten Regeln des Goethe-Instituts (Stand September 2023).',
    },
    {
      q: 'Werden meine Aufnahme und meine Antworten gespeichert?',
      a: 'Die Sprechaufnahme bleibt nur im Speicher Ihres Browsers und wird gelöscht, wenn Sie die Seite verlassen. Ihre Antworten werden nur auf diesem Gerät (im Local Storage des Browsers) gespeichert; nichts wird an unseren Server gesendet.',
    },
  ],
  en: [
    {
      q: 'Is this the official Goethe exam?',
      a: 'No. This is a free, independent practice test by Triad Vision, built like the publicly described Goethe-Zertifikat A1 (Start Deutsch 1) and B1 exams. All texts and tasks are our own; we are not affiliated with the Goethe-Institut. The real exam can only be taken at the Goethe-Institut or a licensed exam centre.',
    },
    {
      q: 'How is the test scored?',
      a: 'Listening and reading are scored automatically. For writing and speaking you compare your answer with the model answer and tick a checklist. A1: at most 100 points in total, pass from 60. B1: each module at most 100 points, pass from 60 per module — following the Goethe-Institut’s published rules (as of September 2023).',
    },
    {
      q: 'Are my recording and my answers stored?',
      a: 'The speaking recording stays only in your browser’s memory and is deleted when you leave the page. Your answers are saved only on this device (in the browser’s local storage); nothing is sent to our server.',
    },
  ],
  ru: [
    {
      q: 'Это официальный экзамен Goethe?',
      a: 'Нет. Это бесплатный независимый пробный тест от Triad Vision, построенный по открыто описанной структуре экзаменов Goethe-Zertifikat A1 (Start Deutsch 1) и B1. Все тексты и задания написаны нами; мы не связаны с Goethe-Institut. Настоящий экзамен сдаётся только в Goethe-Institut или в лицензированном экзаменационном центре.',
    },
    {
      q: 'Как оценивается тест?',
      a: 'Аудирование и чтение проверяются автоматически. Письмо и говорение вы сравниваете с образцом ответа и отмечаете пункты чек-листа. A1: всего максимум 100 баллов, экзамен сдан от 60. B1: каждый модуль максимум 100 баллов, от 60 в каждом модуле — по опубликованным правилам Goethe-Institut (на сентябрь 2023).',
    },
    {
      q: 'Сохраняются ли моя запись и ответы?',
      a: 'Запись речи остаётся только в памяти вашего браузера и удаляется, когда вы покидаете страницу. Ответы сохраняются только на этом устройстве (в local storage браузера); на наш сервер ничего не отправляется.',
    },
  ],
  tr: [
    {
      q: 'Bu resmi Goethe sınavı mı?',
      a: 'Hayır. Bu, Triad Vision’ın ücretsiz ve bağımsız deneme sınavıdır; Goethe-Zertifikat A1 (Start Deutsch 1) ve B1 sınavlarının kamuya açık yapısına göre hazırlanmıştır, tüm metinler ve görevler bize aittir. Goethe-Institut ile bağlantımız yoktur. Gerçek sınava yalnızca Goethe-Institut’ta veya lisanslı bir sınav merkezinde girilebilir.',
    },
    {
      q: 'Test nasıl puanlanıyor?',
      a: 'Dinleme ve okuma otomatik puanlanır. Yazma ve konuşmada cevabınızı örnek cevapla karşılaştırıp bir kontrol listesini işaretlersiniz. A1: toplam en fazla 100 puan, 60 puandan itibaren geçer. B1: her modül en fazla 100 puan, her modülde 60 puandan itibaren geçer — Goethe-Institut’un yayımladığı kurallara göre (Eylül 2023 itibarıyla).',
    },
    {
      q: 'Ses kaydım ve cevaplarım saklanıyor mu?',
      a: 'Konuşma kaydı yalnızca tarayıcınızın belleğinde kalır ve sayfadan çıktığınızda silinir. Cevaplarınız yalnızca bu cihazda (tarayıcının local storage alanında) saklanır; sunucumuza hiçbir şey gönderilmez.',
    },
  ],
  uk: [
    {
      q: 'Це офіційний іспит Goethe?',
      a: 'Ні. Це безкоштовний незалежний пробний тест від Triad Vision, побудований за відкрито описаною структурою іспитів Goethe-Zertifikat A1 (Start Deutsch 1) і B1. Усі тексти й завдання написані нами; ми не пов’язані з Goethe-Institut. Справжній іспит можна скласти лише в Goethe-Institut або ліцензованому екзаменаційному центрі.',
    },
    {
      q: 'Як оцінюється тест?',
      a: 'Аудіювання та читання перевіряються автоматично. Письмо й говоріння ви порівнюєте зі зразком відповіді та позначаєте пункти чек-листа. A1: загалом максимум 100 балів, складено від 60. B1: кожен модуль максимум 100 балів, від 60 у кожному модулі — за опублікованими правилами Goethe-Institut (станом на вересень 2023).',
    },
    {
      q: 'Чи зберігаються мій запис і відповіді?',
      a: 'Запис мовлення залишається лише в пам’яті вашого браузера й видаляється, коли ви залишаєте сторінку. Відповіді зберігаються лише на цьому пристрої (у local storage браузера); на наш сервер нічого не надсилається.',
    },
  ],
};

export const LEVEL_SELF_FAQ: Record<Lang, FaqItem[]> = {
  az: [
    {
      q: 'Özünüqiymətləndirmə nə qədər dəqiqdir?',
      a: 'Bu, Avropa Şurasının CEFR özünüqiymətləndirmə cədvəlinə əsaslanan “bacarıram” ifadələri ilə istiqamət verir, test və ya sertifikat deyil. Ölçülmüş nəticə üçün sınaq imtahanımızı və ya rəsmi imtahanı keçin.',
    },
    {
      q: 'B1 səviyyəsinə çatmaq nə qədər çəkir?',
      a: 'Goethe-Institut-un təxmininə görə sıfırdan B1-ə təxminən 350–650 dərs vahidi (45 dəqiqəlik), yəni təxminən 260–490 saat lazımdır; müstəqil məşğələ buna əlavədir. Plan gündəlik saatlarınıza görə həftələri hesablayır.',
    },
    {
      q: 'Test pulsuzdur? Qeydiyyat lazımdır?',
      a: 'Pulsuzdur və qeydiyyat tələb olunmur. Cavablarınız yalnız brauzerinizdə saxlanılır.',
    },
  ],
  de: [
    {
      q: 'Wie genau ist die Selbsteinschätzung?',
      a: 'Sie gibt eine Orientierung mit Kann-Beschreibungen nach dem GER-Raster zur Selbstbeurteilung des Europarats; sie ist kein Test und kein Zertifikat. Ein gemessenes Ergebnis erhalten Sie mit unserem Übungstest oder einer offiziellen Prüfung.',
    },
    {
      q: 'Wie lange dauert es bis B1?',
      a: 'Das Goethe-Institut schätzt von null bis B1 etwa 350–650 Unterrichtseinheiten à 45 Minuten, also etwa 260–490 Stunden; Selbstlernzeit kommt hinzu. Der Plan rechnet die Wochen aus Ihren Stunden pro Tag.',
    },
    {
      q: 'Kostet der Test etwas? Muss ich mich registrieren?',
      a: 'Der Test ist kostenlos und ohne Registrierung. Ihre Antworten bleiben nur in Ihrem Browser.',
    },
  ],
  en: [
    {
      q: 'How accurate is the self-assessment?',
      a: 'It gives an orientation with “can do” statements based on the Council of Europe’s CEFR self-assessment grid; it is not a test or a certificate. For a measured result, take our mock exam or an official exam.',
    },
    {
      q: 'How long does it take to reach B1?',
      a: 'The Goethe-Institut estimates about 350–650 teaching units of 45 minutes from zero to B1, i.e. roughly 260–490 hours; self-study comes on top. The plan turns your hours per day into weeks.',
    },
    {
      q: 'Is the test free? Do I need to register?',
      a: 'It is free and needs no registration. Your answers stay only in your browser.',
    },
  ],
  ru: [
    {
      q: 'Насколько точна самооценка?',
      a: 'Она даёт ориентир по формулировкам «я умею» на основе таблицы самооценки CEFR Совета Европы; это не тест и не сертификат. Для измеренного результата пройдите наш пробный экзамен или официальный экзамен.',
    },
    {
      q: 'Сколько времени нужно до уровня B1?',
      a: 'По оценке Goethe-Institut, с нуля до B1 нужно около 350–650 учебных единиц по 45 минут, то есть примерно 260–490 часов; самостоятельные занятия — дополнительно. План пересчитывает это в недели по вашим часам в день.',
    },
    {
      q: 'Тест платный? Нужна регистрация?',
      a: 'Тест бесплатный и без регистрации. Ваши ответы остаются только в вашем браузере.',
    },
  ],
  tr: [
    {
      q: 'Öz değerlendirme ne kadar doğru?',
      a: 'Avrupa Konseyi’nin CEFR öz değerlendirme tablosuna dayanan “yapabilirim” ifadeleriyle bir yön gösterir; bir test veya sertifika değildir. Ölçülmüş bir sonuç için deneme sınavımıza ya da resmi bir sınava girin.',
    },
    {
      q: 'B1 seviyesine ulaşmak ne kadar sürer?',
      a: 'Goethe-Institut’un tahminine göre sıfırdan B1’e yaklaşık 350–650 ders birimi (45 dakikalık), yani yaklaşık 260–490 saat gerekir; bireysel çalışma buna eklenir. Plan, günlük saatlerinize göre haftaları hesaplar.',
    },
    {
      q: 'Test ücretli mi? Kayıt gerekiyor mu?',
      a: 'Test ücretsizdir ve kayıt gerektirmez. Cevaplarınız yalnızca tarayıcınızda kalır.',
    },
  ],
  uk: [
    {
      q: 'Наскільки точна самооцінка?',
      a: 'Вона дає орієнтир за твердженнями «я вмію» на основі таблиці самооцінювання CEFR Ради Європи; це не тест і не сертифікат. Для виміряного результату пройдіть наш пробний іспит або офіційний іспит.',
    },
    {
      q: 'Скільки часу потрібно до рівня B1?',
      a: 'За оцінкою Goethe-Institut, з нуля до B1 потрібно близько 350–650 навчальних одиниць по 45 хвилин, тобто приблизно 260–490 годин; самостійні заняття — додатково. План перераховує це в тижні за вашими годинами на день.',
    },
    {
      q: 'Тест платний? Потрібна реєстрація?',
      a: 'Тест безкоштовний і без реєстрації. Ваші відповіді залишаються лише у вашому браузері.',
    },
  ],
};

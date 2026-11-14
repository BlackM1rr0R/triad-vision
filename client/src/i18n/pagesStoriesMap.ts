// Success stories on a map of Germany (/stories): workers' photos + short quotes at their German city.
// Registered with registerCopy(pagesStoriesMap) by components/stories/StoriesMap.

const az = {
  sm: {
    eyebrow: 'Uğur hekayələri',
    title: 'Almaniyanın hər yerində işçilərimiz',
    subtitle: 'Şəkilə toxunun və onların hekayəsini oxuyun — hər biri bu gün Almaniyada işləyir.',
    mapLabel: 'Uğur hekayələrinin Almaniya xəritəsi',
    viewMap: 'Xəritə',
    viewList: 'Siyahı',
    view: 'Görünüş',
    pin: '{{name}}, {{city}}: hekayəni aç',
    cluster: '{{city}} ətrafında {{count}} hekayə',
    clusterTitle: '{{city}} ətrafı',
    hint: 'Hekayəni oxumaq üçün xəritədə şəkil seçin.',
    close: 'Bağla',
    elsewhere: 'Digər şəhərlər',
    consent: 'Hekayələr yalnız müəlliflərinin razılığı ilə dərc olunur.',
  },
};

type Copy = typeof az;

const de: Copy = {
  sm: {
    eyebrow: 'Erfolgsgeschichten',
    title: 'Unsere Fachkräfte in ganz Deutschland',
    subtitle: 'Tippen Sie auf ein Foto und lesen Sie die Geschichte — alle arbeiten heute in Deutschland.',
    mapLabel: 'Deutschlandkarte der Erfolgsgeschichten',
    viewMap: 'Karte',
    viewList: 'Liste',
    view: 'Ansicht',
    pin: '{{name}}, {{city}}: Geschichte öffnen',
    cluster: '{{count}} Geschichten im Raum {{city}}',
    clusterTitle: 'Raum {{city}}',
    hint: 'Wählen Sie ein Foto auf der Karte, um die Geschichte zu lesen.',
    close: 'Schließen',
    elsewhere: 'Weitere Orte',
    consent: 'Geschichten erscheinen nur mit Einwilligung der Personen.',
  },
};

const en: Copy = {
  sm: {
    eyebrow: 'Success stories',
    title: 'Our workers all over Germany',
    subtitle: 'Tap a photo and read their story — every one of them works in Germany today.',
    mapLabel: 'Map of Germany with success stories',
    viewMap: 'Map',
    viewList: 'List',
    view: 'View',
    pin: '{{name}}, {{city}}: open the story',
    cluster: '{{count}} stories around {{city}}',
    clusterTitle: 'Around {{city}}',
    hint: 'Pick a photo on the map to read the story.',
    close: 'Close',
    elsewhere: 'Other places',
    consent: 'Stories are published only with the consent of the people concerned.',
  },
};

const ru: Copy = {
  sm: {
    eyebrow: 'Истории успеха',
    title: 'Наши специалисты по всей Германии',
    subtitle: 'Нажмите на фото и прочитайте историю — все они сегодня работают в Германии.',
    mapLabel: 'Карта Германии с историями успеха',
    viewMap: 'Карта',
    viewList: 'Список',
    view: 'Вид',
    pin: '{{name}}, {{city}}: открыть историю',
    cluster: '{{count}} историй в районе {{city}}',
    clusterTitle: 'Район {{city}}',
    hint: 'Выберите фото на карте, чтобы прочитать историю.',
    close: 'Закрыть',
    elsewhere: 'Другие города',
    consent: 'Истории публикуются только с согласия их авторов.',
  },
};

const tr: Copy = {
  sm: {
    eyebrow: 'Başarı hikâyeleri',
    title: 'Almanya’nın her yerinde çalışanlarımız',
    subtitle: 'Bir fotoğrafa dokunun ve hikâyesini okuyun — hepsi bugün Almanya’da çalışıyor.',
    mapLabel: 'Başarı hikâyeleriyle Almanya haritası',
    viewMap: 'Harita',
    viewList: 'Liste',
    view: 'Görünüm',
    pin: '{{name}}, {{city}}: hikâyeyi aç',
    cluster: '{{city}} çevresinde {{count}} hikâye',
    clusterTitle: '{{city}} çevresi',
    hint: 'Hikâyeyi okumak için haritada bir fotoğraf seçin.',
    close: 'Kapat',
    elsewhere: 'Diğer yerler',
    consent: 'Hikâyeler yalnızca sahiplerinin onayıyla yayımlanır.',
  },
};

const uk: Copy = {
  sm: {
    eyebrow: 'Історії успіху',
    title: 'Наші фахівці по всій Німеччині',
    subtitle: 'Торкніться фото й прочитайте історію — усі вони сьогодні працюють у Німеччині.',
    mapLabel: 'Карта Німеччини з історіями успіху',
    viewMap: 'Карта',
    viewList: 'Список',
    view: 'Вигляд',
    pin: '{{name}}, {{city}}: відкрити історію',
    cluster: '{{count}} історій у районі {{city}}',
    clusterTitle: 'Район {{city}}',
    hint: 'Виберіть фото на карті, щоб прочитати історію.',
    close: 'Закрити',
    elsewhere: 'Інші міста',
    consent: 'Історії публікуються лише за згодою їхніх авторів.',
  },
};

export const pagesStoriesMap = { az, de, en, ru, tr, uk };

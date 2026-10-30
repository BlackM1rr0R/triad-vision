// Public images: ImageField hints / checks / alt text (admin), company logo (admin + employer portal),
// testimonial author photo field, and the few public alt texts (tr / uk too). Registered with
// registerCopy(pagesPublicImages) by the modules that use it.

const az = {
  publicImages: {
    hint: {
      photo: 'JPG, PNG, WebP və ya AVIF, ən çox 8 MB. Serverdə WebP-yə çevrilir, EXIF/GPS silinir, uzun tərəf ≤ 2400 px.',
      cover: 'Üz şəkli: 16:9 nisbət tövsiyə olunur (məs. 1600 × 900). JPG, PNG, WebP, AVIF, ≤ 8 MB.',
      logo: 'Loqo: 1:1 (kvadrat) tövsiyə olunur. PNG / WebP şəffaflığı saxlanılır, SVG də olar. ≤ 8 MB.',
      avatar: 'Portret: 1:1 (kvadrat), dairəvi göstərilir. JPG, PNG, WebP, ≤ 8 MB.',
      og: 'Sosial şəbəkə önizləməsi: 1200 × 630 (1.91:1). SVG olmaz — JPG-yə çevrilir. ≤ 8 MB.',
    },
    alt: 'Alt mətni',
    altPlaceholder: 'Şəkildə nə var? (ekran oxuyucuları və Google üçün)',
    altFallback: 'Boş qalsa: “{{fallback}}”',
    tooLarge: 'Fayl 8 MB-dan böyükdür.',
    badType: 'Bu fayl növü burada qəbul edilmir.',
    svgNotAllowed: 'SVG yalnız loqo və ikonlar üçün olar.',
    size: '{{w}} × {{h}} px',
    ratio: 'Şəkil {{actual}} nisbətindədir, {{expected}} tövsiyə olunur — kəsilə bilər.',
    companyLogo: {
      title: 'Şirkət loqosu',
      upload: 'Loqo yüklə',
      replace: 'Dəyiş',
      remove: 'Sil',
      none: 'Loqo yoxdur',
      hint: 'PNG, JPG, WebP və ya AVIF, kvadrata yaxın, ≤ 8 MB. 512 px-ə qədər kiçildilir, şəffaflıq qalır. SVG olmaz.',
      employerNote: 'Loqo vakansiyalarınızda (şirkət adı göstərilirsə) görünür. Dəyişəndə komandamız xəbər alır.',
      saved: 'Loqo yadda saxlandı.',
      removed: 'Loqo silindi.',
      failed: 'Loqo yüklənmədi.',
    },
    logoAlt: '{{name}} loqosu',
  },
  admin: { content: { f: { authorPhoto: 'Müəllifin fotosu' }, hint: { authorPhoto: 'Kvadrat portret; boş qalsa baş hərflər göstərilir.' } } },
};

const de = {
  publicImages: {
    hint: {
      photo: 'JPG, PNG, WebP oder AVIF, max. 8 MB. Wird auf dem Server zu WebP, EXIF/GPS entfernt, lange Seite ≤ 2400 px.',
      cover: 'Titelbild: Seitenverhältnis 16:9 empfohlen (z. B. 1600 × 900). JPG, PNG, WebP, AVIF, ≤ 8 MB.',
      logo: 'Logo: 1:1 (quadratisch) empfohlen. Transparenz von PNG / WebP bleibt, SVG erlaubt. ≤ 8 MB.',
      avatar: 'Porträt: 1:1 (quadratisch), wird rund angezeigt. JPG, PNG, WebP, ≤ 8 MB.',
      og: 'Social-Media-Vorschau: 1200 × 630 (1,91:1). Kein SVG — wird zu JPG. ≤ 8 MB.',
    },
    alt: 'Alternativtext',
    altPlaceholder: 'Was zeigt das Bild? (für Screenreader und Google)',
    altFallback: 'Leer: „{{fallback}}“',
    tooLarge: 'Die Datei ist größer als 8 MB.',
    badType: 'Dieser Dateityp ist hier nicht erlaubt.',
    svgNotAllowed: 'SVG ist nur für Logos und Icons erlaubt.',
    size: '{{w}} × {{h}} px',
    ratio: 'Das Bild hat {{actual}}, empfohlen ist {{expected}} — es kann beschnitten werden.',
    companyLogo: {
      title: 'Firmenlogo',
      upload: 'Logo hochladen',
      replace: 'Ersetzen',
      remove: 'Entfernen',
      none: 'Kein Logo',
      hint: 'PNG, JPG, WebP oder AVIF, möglichst quadratisch, ≤ 8 MB. Wird auf 512 px verkleinert, Transparenz bleibt. Kein SVG.',
      employerNote: 'Das Logo erscheint in Ihren Stellenanzeigen (wenn der Firmenname angezeigt wird). Bei Änderungen wird unser Team informiert.',
      saved: 'Logo gespeichert.',
      removed: 'Logo entfernt.',
      failed: 'Das Logo konnte nicht hochgeladen werden.',
    },
    logoAlt: 'Logo von {{name}}',
  },
  admin: { content: { f: { authorPhoto: 'Foto der Person' }, hint: { authorPhoto: 'Quadratisches Porträt; leer = Initialen.' } } },
};

const en = {
  publicImages: {
    hint: {
      photo: 'JPG, PNG, WebP or AVIF, up to 8 MB. Converted to WebP on the server, EXIF/GPS removed, long side ≤ 2400 px.',
      cover: 'Cover: 16:9 recommended (e.g. 1600 × 900). JPG, PNG, WebP, AVIF, ≤ 8 MB.',
      logo: 'Logo: 1:1 (square) recommended. PNG / WebP transparency is kept, SVG allowed. ≤ 8 MB.',
      avatar: 'Portrait: 1:1 (square), shown round. JPG, PNG, WebP, ≤ 8 MB.',
      og: 'Social preview: 1200 × 630 (1.91:1). No SVG — converted to JPG. ≤ 8 MB.',
    },
    alt: 'Alt text',
    altPlaceholder: 'What does the image show? (for screen readers and Google)',
    altFallback: 'If empty: “{{fallback}}”',
    tooLarge: 'The file is larger than 8 MB.',
    badType: 'This file type is not allowed here.',
    svgNotAllowed: 'SVG is only allowed for logos and icons.',
    size: '{{w}} × {{h}} px',
    ratio: 'The image is {{actual}}; {{expected}} is recommended — it may be cropped.',
    companyLogo: {
      title: 'Company logo',
      upload: 'Upload logo',
      replace: 'Replace',
      remove: 'Remove',
      none: 'No logo',
      hint: 'PNG, JPG, WebP or AVIF, roughly square, ≤ 8 MB. Scaled to 512 px, transparency kept. No SVG.',
      employerNote: 'The logo appears on your job ads (when the company name is shown). Our team is notified when you change it.',
      saved: 'Logo saved.',
      removed: 'Logo removed.',
      failed: 'The logo could not be uploaded.',
    },
    logoAlt: '{{name}} logo',
  },
  admin: { content: { f: { authorPhoto: 'Author photo' }, hint: { authorPhoto: 'Square portrait; empty = initials.' } } },
};

const ru = {
  publicImages: {
    hint: {
      photo: 'JPG, PNG, WebP или AVIF, до 8 МБ. На сервере конвертируется в WebP, EXIF/GPS удаляются, длинная сторона ≤ 2400 px.',
      cover: 'Обложка: рекомендуется 16:9 (напр. 1600 × 900). JPG, PNG, WebP, AVIF, ≤ 8 МБ.',
      logo: 'Логотип: рекомендуется 1:1 (квадрат). Прозрачность PNG / WebP сохраняется, SVG можно. ≤ 8 МБ.',
      avatar: 'Портрет: 1:1 (квадрат), показывается круглым. JPG, PNG, WebP, ≤ 8 МБ.',
      og: 'Превью для соцсетей: 1200 × 630 (1,91:1). Без SVG — конвертируется в JPG. ≤ 8 МБ.',
    },
    alt: 'Альтернативный текст',
    altPlaceholder: 'Что на изображении? (для скринридеров и Google)',
    altFallback: 'Если пусто: «{{fallback}}»',
    tooLarge: 'Файл больше 8 МБ.',
    badType: 'Этот тип файла здесь не принимается.',
    svgNotAllowed: 'SVG можно только для логотипов и иконок.',
    size: '{{w}} × {{h}} px',
    ratio: 'Соотношение изображения {{actual}}, рекомендуется {{expected}} — может быть обрезано.',
    companyLogo: {
      title: 'Логотип компании',
      upload: 'Загрузить логотип',
      replace: 'Заменить',
      remove: 'Удалить',
      none: 'Нет логотипа',
      hint: 'PNG, JPG, WebP или AVIF, близко к квадрату, ≤ 8 МБ. Уменьшается до 512 px, прозрачность сохраняется. Без SVG.',
      employerNote: 'Логотип показывается в ваших вакансиях (если указано название компании). При изменении наша команда получает уведомление.',
      saved: 'Логотип сохранён.',
      removed: 'Логотип удалён.',
      failed: 'Не удалось загрузить логотип.',
    },
    logoAlt: 'Логотип {{name}}',
  },
  admin: { content: { f: { authorPhoto: 'Фото автора' }, hint: { authorPhoto: 'Квадратный портрет; если пусто — инициалы.' } } },
};

// Public site only (job cards / job page alt text).
const tr = { publicImages: { logoAlt: '{{name}} logosu' } };
const uk = { publicImages: { logoAlt: 'Логотип {{name}}' } };

export const pagesPublicImages = { az, de, en, ru, tr, uk };

/**
 * Texts of the prefilled document templates (lib/docTemplates): the VIDEX preparation sheet in the client's
 * language (6 languages). The German field labels of the sheet come from lib/ai/features/caseAi/videx.ts
 * (FIELD_DEFS, az / de / en / ru); tr and uk read the English hint.
 */

export const SHEET_LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type SheetLang = (typeof SHEET_LANGS)[number];

export const asSheetLang = (v: unknown): SheetLang => ((SHEET_LANGS as readonly string[]).includes(String(v)) ? (v as SheetLang) : 'az');

/** Which hint language of the VIDEX labels (az / de / en / ru) a sheet language uses. */
export const hintLang = (l: SheetLang): 'az' | 'de' | 'en' | 'ru' => (l === 'tr' || l === 'uk' ? 'en' : l);

export interface SheetText {
  title: string;
  intro: string;
  /** Short legend under the intro. */
  legend: string;
  missing: string;
  employerLater: string;
  disclaimer: string;
  colField: string;
  colValue: string;
  generated: string;
  page: string;
  of: string;
}

export const SHEET_TEXT: Record<SheetLang, SheetText> = {
  az: {
    title: 'VIDEX hazırlıq vərəqi',
    intro:
      'VIDEX səfirliyin onlayn viza anketidir. Bu vərəqdə anketin sahələri və profilinizdən götürülmüş cavablar var. Cavabları yoxlayın və anketə özünüz köçürün.',
    legend: 'Sarı xana: məlumat hələ yoxdur. Onu özünüz doldurun və ya meneceriniz ilə əlaqə saxlayın.',
    missing: 'doldurun',
    employerLater: 'İşəgötürən məlumatını meneceriniz İş müqaviləsi təsdiqlənəndən sonra verəcək.',
    disclaimer:
      'Bu vərəq rəsmi anket deyil. Anketi videx.diplo.de saytında Siz özünüz doldurub göndərirsiniz. Biz yalnız sənədləri hazırlayırıq. Vizanı səfirlik verir.',
    colField: 'VIDEX sahəsi',
    colValue: 'Cavab',
    generated: 'Hazırlanıb',
    page: 'Səhifə',
    of: '/',
  },
  de: {
    title: 'VIDEX-Vorbereitungsblatt',
    intro:
      'VIDEX ist das Online-Antragsformular der Botschaft. Dieses Blatt zeigt die Felder des Formulars mit den Angaben aus Ihrem Profil. Bitte prüfen Sie die Angaben und übertragen Sie sie selbst in das Formular.',
    legend: 'Gelbes Feld: Angabe fehlt noch. Bitte selbst ergänzen oder Ihren Ansprechpartner fragen.',
    missing: 'ergänzen',
    employerLater: 'Die Arbeitgeberdaten erhalten Sie nach der Freigabe des Arbeitsvertrags.',
    disclaimer:
      'Dieses Blatt ist kein amtliches Formular. Sie füllen den Antrag auf videx.diplo.de selbst aus und reichen ihn selbst ein. Wir bereiten nur die Unterlagen vor. Über das Visum entscheidet die Botschaft.',
    colField: 'VIDEX-Feld',
    colValue: 'Angabe',
    generated: 'Erstellt',
    page: 'Seite',
    of: 'von',
  },
  en: {
    title: 'VIDEX preparation sheet',
    intro:
      "VIDEX is the embassy's online visa application form. This sheet lists the form fields with the answers from your profile. Check the answers and copy them into the form yourself.",
    legend: 'Yellow box: the information is still missing. Fill it in yourself or ask your manager.',
    missing: 'fill in',
    employerLater: 'Your manager will give you the employer details once the work contract is approved.',
    disclaimer:
      'This sheet is not an official form. You fill in and submit the application on videx.diplo.de yourself. We only prepare the documents. The embassy decides on the visa.',
    colField: 'VIDEX field',
    colValue: 'Answer',
    generated: 'Prepared',
    page: 'Page',
    of: 'of',
  },
  ru: {
    title: 'Лист подготовки к VIDEX',
    intro:
      'VIDEX — онлайн-анкета посольства на визу. В этом листе поля анкеты и ответы из вашего профиля. Проверьте ответы и перенесите их в анкету сами.',
    legend: 'Жёлтое поле: данных пока нет. Заполните сами или спросите вашего менеджера.',
    missing: 'заполнить',
    employerLater: 'Данные работодателя менеджер сообщит после утверждения трудового договора.',
    disclaimer:
      'Этот лист не является официальной анкетой. Анкету на videx.diplo.de вы заполняете и отправляете сами. Мы только готовим документы. Решение о визе принимает посольство.',
    colField: 'Поле VIDEX',
    colValue: 'Ответ',
    generated: 'Подготовлено',
    page: 'Стр.',
    of: 'из',
  },
  tr: {
    title: 'VIDEX hazırlık sayfası',
    intro:
      'VIDEX, büyükelçiliğin çevrimiçi vize başvuru formudur. Bu sayfada formun alanları ve profilinizdeki cevaplar yer alır. Cevapları kontrol edin ve forma kendiniz aktarın.',
    legend: 'Sarı kutu: bilgi henüz eksik. Kendiniz doldurun veya yöneticinize sorun.',
    missing: 'doldurun',
    employerLater: 'İşveren bilgilerini yöneticiniz iş sözleşmesi onaylandıktan sonra verecek.',
    disclaimer:
      'Bu sayfa resmi bir form değildir. Başvuruyu videx.diplo.de adresinde kendiniz doldurup gönderirsiniz. Biz yalnızca belgeleri hazırlarız. Vizaya büyükelçilik karar verir.',
    colField: 'VIDEX alanı',
    colValue: 'Cevap',
    generated: 'Hazırlandı',
    page: 'Sayfa',
    of: '/',
  },
  uk: {
    title: 'Аркуш підготовки до VIDEX',
    intro:
      'VIDEX — онлайн-анкета посольства на візу. У цьому аркуші поля анкети та відповіді з вашого профілю. Перевірте відповіді й перенесіть їх в анкету самостійно.',
    legend: 'Жовте поле: даних ще немає. Заповніть самі або запитайте вашого менеджера.',
    missing: 'заповнити',
    employerLater: 'Дані роботодавця менеджер надасть після затвердження трудового договору.',
    disclaimer:
      'Цей аркуш не є офіційною анкетою. Анкету на videx.diplo.de ви заповнюєте та надсилаєте самі. Ми лише готуємо документи. Рішення щодо візи ухвалює посольство.',
    colField: 'Поле VIDEX',
    colValue: 'Відповідь',
    generated: 'Підготовлено',
    page: 'Стор.',
    of: 'з',
  },
};

/** Drive sub-folder (inside the client folder) for templates staff attach to the case. */
export const TEMPLATES_FOLDER_NAME = 'Sənəd şablonları';

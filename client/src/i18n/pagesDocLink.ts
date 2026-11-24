// Linked case documents (server lib/docLink): a file uploaded once for a requirement the initial list and the embassy
// list both have is attached to both. Chip on the linked copy in the client's document list
// (components/portal/CaseDocuments) and in the admin case documents (components/admin/case/Requirements).
// Same keys in every language; includes tr / uk. `admin` is staff-only.

const az = {
  dlink: {
    from: {
      INITIAL: 'Avtomatik əlavə olundu: İlkin sənədlərdən',
      EMBASSY: 'Avtomatik əlavə olundu: Səfirlik sənədlərindən',
    },
    hint: 'Bu faylı bir dəfə yükləmisiniz: eyni sənəd hər iki siyahıda lazımdır, ona görə hər ikisinə əlavə olundu.',
    admin: {
      follows: 'Mənbə sənədin yoxlanışını izləyir (qəbul / rədd avtomatik keçir).',
      detached: 'Ayrıca yoxlanılıb',
      detachedHint: 'Bu nüsxə ayrıca yoxlanılıb: mənbə sənədin yoxlanışı onu artıq dəyişmir.',
      keyLabel: 'Sənəd növü (istəyə görə)',
      keyNone: 'Növ seçilməyib',
      keyHint: 'Növ seçilsə, digər siyahıdakı eyni sənəd (məs. pasport) bura avtomatik əlavə olunur.',
      editReq: 'Tələbi redaktə et',
      editReqTitle: 'Sənəd tələbini redaktə et',
      saved: 'Yadda saxlanıldı',
      linkedCount: '{{count}} sənəd digər siyahıdan avtomatik əlavə olundu',
    },
  },
};

type Copy = typeof az;

const de: Copy = {
  dlink: {
    from: {
      INITIAL: 'Automatisch hinzugefügt: aus den Erstdokumenten',
      EMBASSY: 'Automatisch hinzugefügt: aus den Botschaftsunterlagen',
    },
    hint: 'Sie haben diese Datei einmal hochgeladen: Dasselbe Dokument wird in beiden Listen gebraucht, deshalb steht es in beiden.',
    admin: {
      follows: 'Folgt der Prüfung des Quelldokuments (Annahme / Ablehnung wird übernommen).',
      detached: 'Separat geprüft',
      detachedHint: 'Diese Kopie wurde separat geprüft: Die Prüfung des Quelldokuments ändert sie nicht mehr.',
      keyLabel: 'Dokumenttyp (optional)',
      keyNone: 'Kein Typ',
      keyHint: 'Mit Typ wird dasselbe Dokument aus der anderen Liste (z. B. Reisepass) automatisch hier hinzugefügt.',
      editReq: 'Anforderung bearbeiten',
      editReqTitle: 'Dokumentanforderung bearbeiten',
      saved: 'Gespeichert',
      linkedCount: '{{count}} Dokument(e) automatisch aus der anderen Liste hinzugefügt',
    },
  },
};

const en: Copy = {
  dlink: {
    from: {
      INITIAL: 'Added automatically: from initial documents',
      EMBASSY: 'Added automatically: from embassy documents',
    },
    hint: 'You uploaded this file once: the same document is needed in both lists, so it was added to both.',
    admin: {
      follows: 'Follows the review of the source document (accept / reject carries over).',
      detached: 'Reviewed separately',
      detachedHint: 'This copy was reviewed on its own: the source document’s review no longer changes it.',
      keyLabel: 'Document type (optional)',
      keyNone: 'No type',
      keyHint: 'With a type, the same document from the other list (e.g. passport) is added here automatically.',
      editReq: 'Edit requirement',
      editReqTitle: 'Edit document requirement',
      saved: 'Saved',
      linkedCount: '{{count}} document(s) added automatically from the other list',
    },
  },
};

const ru: Copy = {
  dlink: {
    from: {
      INITIAL: 'Добавлено автоматически: из первичных документов',
      EMBASSY: 'Добавлено автоматически: из документов для посольства',
    },
    hint: 'Вы загрузили этот файл один раз: тот же документ нужен в обоих списках, поэтому он добавлен в оба.',
    admin: {
      follows: 'Следует проверке исходного документа (принятие / отклонение переносится).',
      detached: 'Проверено отдельно',
      detachedHint: 'Эта копия проверена отдельно: проверка исходного документа её больше не меняет.',
      keyLabel: 'Тип документа (необязательно)',
      keyNone: 'Без типа',
      keyHint: 'С типом тот же документ из другого списка (например, паспорт) добавляется сюда автоматически.',
      editReq: 'Изменить требование',
      editReqTitle: 'Изменить требование к документу',
      saved: 'Сохранено',
      linkedCount: 'Документов автоматически добавлено из другого списка: {{count}}',
    },
  },
};

const tr: Copy = {
  dlink: {
    from: {
      INITIAL: 'Otomatik eklendi: ilk belgelerden',
      EMBASSY: 'Otomatik eklendi: elçilik belgelerinden',
    },
    hint: 'Bu dosyayı bir kez yüklediniz: aynı belge iki listede de gerekli olduğu için ikisine de eklendi.',
    admin: {
      follows: 'Kaynak belgenin incelemesini izler (kabul / ret aktarılır).',
      detached: 'Ayrı incelendi',
      detachedHint: 'Bu kopya ayrı incelendi: kaynak belgenin incelemesi onu artık değiştirmez.',
      keyLabel: 'Belge türü (isteğe bağlı)',
      keyNone: 'Tür yok',
      keyHint: 'Tür seçilirse diğer listedeki aynı belge (ör. pasaport) buraya otomatik eklenir.',
      editReq: 'Gereksinimi düzenle',
      editReqTitle: 'Belge gereksinimini düzenle',
      saved: 'Kaydedildi',
      linkedCount: 'Diğer listeden otomatik eklenen belge: {{count}}',
    },
  },
};

const uk: Copy = {
  dlink: {
    from: {
      INITIAL: 'Додано автоматично: з первинних документів',
      EMBASSY: 'Додано автоматично: з документів для посольства',
    },
    hint: 'Ви завантажили цей файл один раз: той самий документ потрібен в обох списках, тому його додано до обох.',
    admin: {
      follows: 'Слідує перевірці вихідного документа (прийняття / відхилення переноситься).',
      detached: 'Перевірено окремо',
      detachedHint: 'Цю копію перевірено окремо: перевірка вихідного документа її більше не змінює.',
      keyLabel: 'Тип документа (необовʼязково)',
      keyNone: 'Без типу',
      keyHint: 'З типом той самий документ з іншого списку (наприклад, паспорт) додається сюди автоматично.',
      editReq: 'Редагувати вимогу',
      editReqTitle: 'Редагувати вимогу до документа',
      saved: 'Збережено',
      linkedCount: 'Документів автоматично додано з іншого списку: {{count}}',
    },
  },
};

export const pagesDocLink: { az: Copy; de: Copy; en: Copy; ru: Copy; tr: Copy; uk: Copy } = { az, de, en, ru, tr, uk };

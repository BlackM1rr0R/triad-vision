// Embassy appointment form of the case drawer / case page (staff): confirmation files, "Düzəlt" (edit) button.
// Registered with registerCopy(pagesCaseAppointment). Same keys in every language.
// We RECORD the appointment the embassy gave; we never book it.

const az = {
  caseAppt: {
    edit: 'Düzəlt',
    editTitle: 'Səfirlik görüşünü düzəlt',
    recordTitle: 'Səfirlik görüşünü qeyd et',
    filesLabel: 'Təsdiq faylı (istəyə bağlı)',
    filesHint: 'Səfirliyin göndərdiyi təsdiq (PDF və ya şəkil). Müştəri onu kabinetində görəcək, müştəri qovluğunda “Termin” altında saxlanacaq.',
    add: 'Fayl əlavə et',
    remove: 'Sil',
    undo: 'Geri qaytar',
    willRemove: 'Silinəcək',
    tooMany: 'Ən çox {{count}} fayl ola bilər.',
    existing: 'Əlavə olunmuş fayllar',
    updateNotice: 'Müştəriyə “Görüş məlumatlarınız yeniləndi” bildirişi göndəriləcək.',
    save: 'Yadda saxla',
    cancel: 'Ləğv et',
  },
};

const de = {
  caseAppt: {
    edit: 'Bearbeiten',
    editTitle: 'Botschaftstermin bearbeiten',
    recordTitle: 'Botschaftstermin eintragen',
    filesLabel: 'Terminbestätigung (optional)',
    filesHint: 'Die Bestätigung der Botschaft (PDF oder Bild). Der Kunde sieht sie in seinem Kundenbereich; sie wird im Kundenordner unter „Termin“ abgelegt.',
    add: 'Datei hinzufügen',
    remove: 'Entfernen',
    undo: 'Rückgängig',
    willRemove: 'Wird entfernt',
    tooMany: 'Höchstens {{count}} Dateien.',
    existing: 'Angehängte Dateien',
    updateNotice: 'Der Kunde erhält die Benachrichtigung „Ihre Termindaten wurden aktualisiert“.',
    save: 'Speichern',
    cancel: 'Abbrechen',
  },
};

const en = {
  caseAppt: {
    edit: 'Edit',
    editTitle: 'Edit embassy appointment',
    recordTitle: 'Record embassy appointment',
    filesLabel: 'Appointment confirmation (optional)',
    filesHint: 'The confirmation the embassy sent (PDF or image). The client sees it in their account; it is saved in the client folder under “Termin”.',
    add: 'Add file',
    remove: 'Remove',
    undo: 'Undo',
    willRemove: 'Will be removed',
    tooMany: 'At most {{count}} files.',
    existing: 'Attached files',
    updateNotice: 'The client gets the notice “Your appointment details were updated”.',
    save: 'Save',
    cancel: 'Cancel',
  },
};

const ru = {
  caseAppt: {
    edit: 'Изменить',
    editTitle: 'Изменить запись в посольство',
    recordTitle: 'Внести запись в посольство',
    filesLabel: 'Подтверждение записи (необязательно)',
    filesHint: 'Подтверждение от посольства (PDF или изображение). Клиент увидит его в кабинете; оно сохраняется в папке клиента в разделе «Termin».',
    add: 'Добавить файл',
    remove: 'Удалить',
    undo: 'Отменить',
    willRemove: 'Будет удалён',
    tooMany: 'Не более {{count}} файлов.',
    existing: 'Прикреплённые файлы',
    updateNotice: 'Клиент получит уведомление «Данные вашего приёма обновлены».',
    save: 'Сохранить',
    cancel: 'Отмена',
  },
};

export const pagesCaseAppointment = { az, de, en, ru };

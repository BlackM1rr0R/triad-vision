import i18n from './index';

/**
 * Mobile strings of "Invite friends" (`m.invite.*`). Registered by the feature module itself
 * (src/features/invite/InviteScreen.tsx). German formal "Sie", Russian "вы".
 */
const az = {
  invite: {
    title: 'Dostunu dəvət et',
    homeTitle: 'Dostunu gətir',
    homeText: 'Dostlarınızı dəvət edin və mükafat qazanın.',
    intro: 'Kontaktlarınızdan dost seçin — mesaj linkinizlə WhatsApp və ya SMS-də açılır. Kontaktlar telefonunuzda qalır, serverə göndərilmir.',
    profession: 'Dostun peşəsi',
    pick: 'Kontakt seç',
    shareAny: 'Başqa tətbiqlə paylaş',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    remove: 'Siyahıdan çıxart',
    noPhone: 'Bu kontaktda telefon nömrəsi yoxdur.',
    denied: 'Kontaktlara icazə verilmədi. Mesajı "Başqa tətbiqlə paylaş" ilə göndərə bilərsiniz.',
    noApp: 'Bu tətbiq telefonda tapılmadı.',
    disabled: 'Proqram hazırda aktiv deyil.',
    sent: 'Göndərildi',
  },
};

type Copy = typeof az;

const de: Copy = {
  invite: {
    title: 'Freunde einladen',
    homeTitle: 'Freunde werben',
    homeText: 'Laden Sie Bekannte ein und erhalten Sie eine Prämie.',
    intro: 'Wählen Sie Kontakte aus — die Nachricht mit Ihrem Link öffnet sich in WhatsApp oder als SMS. Die Kontakte bleiben auf Ihrem Telefon und werden nicht an den Server gesendet.',
    profession: 'Beruf der Person',
    pick: 'Kontakt wählen',
    shareAny: 'Mit anderer App teilen',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    remove: 'Aus der Liste entfernen',
    noPhone: 'Dieser Kontakt hat keine Telefonnummer.',
    denied: 'Kein Zugriff auf Kontakte. Sie können die Nachricht über „Mit anderer App teilen“ senden.',
    noApp: 'Diese App ist auf dem Telefon nicht installiert.',
    disabled: 'Das Programm ist derzeit nicht aktiv.',
    sent: 'Gesendet',
  },
};

const en: Copy = {
  invite: {
    title: 'Invite friends',
    homeTitle: 'Refer a friend',
    homeText: 'Invite friends and earn a reward.',
    intro: 'Pick friends from your contacts — the message with your link opens in WhatsApp or as an SMS. Contacts stay on your phone and are not sent to the server.',
    profession: "Friend's profession",
    pick: 'Pick a contact',
    shareAny: 'Share with another app',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    remove: 'Remove from the list',
    noPhone: 'This contact has no phone number.',
    denied: 'No access to contacts. You can still send the message with "Share with another app".',
    noApp: 'This app is not installed on the phone.',
    disabled: 'The programme is currently not active.',
    sent: 'Sent',
  },
};

const ru: Copy = {
  invite: {
    title: 'Пригласить друзей',
    homeTitle: 'Приведи друга',
    homeText: 'Приглашайте друзей и получайте бонус.',
    intro: 'Выберите друзей из контактов — сообщение с вашей ссылкой откроется в WhatsApp или SMS. Контакты остаются на телефоне и не отправляются на сервер.',
    profession: 'Профессия друга',
    pick: 'Выбрать контакт',
    shareAny: 'Поделиться через другое приложение',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    remove: 'Убрать из списка',
    noPhone: 'У этого контакта нет номера телефона.',
    denied: 'Нет доступа к контактам. Сообщение можно отправить через «Поделиться через другое приложение».',
    noApp: 'Это приложение не установлено на телефоне.',
    disabled: 'Программа сейчас не активна.',
    sent: 'Отправлено',
  },
};

const bundles = { az, de, en, ru };
for (const [lng, b] of Object.entries(bundles)) i18n.addResourceBundle(lng, 'translation', { m: b }, true, false);

export const inviteCopy = bundles;

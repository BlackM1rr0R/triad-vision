import type { Locale } from '@prisma/client';

/**
 * Copy for partner-owned clients (az is the source language): partner notifications about their
 * clients and the invitation a client gets when the partner registered them.
 */
export interface PartnerClientText {
  newClientTitle: (client: string) => string;
  newClientBody: (client: string) => string;
  newCaseTitle: (client: string) => string;
  newCaseBody: (client: string, number: string) => string;
  contractTitle: (client: string) => string;
  contractBody: (client: string, number: string) => string;
  embassyDocsTitle: (client: string) => string;
  embassyDocsBody: (client: string, number: string) => string;
  docsBackTitle: (client: string) => string;
  docsBackBody: (client: string, number: string) => string;
  cancelledTitle: (client: string) => string;
  cancelledBody: (client: string, number: string) => string;
  earnedTitle: (amount: string) => string;
  earnedBody: (client: string, number: string) => string;
  clientsCta: string;
  /** E-mail to a client registered by a partner. */
  inviteTitle: string;
  inviteBody: (name: string, partner: string) => string;
  inviteCta: string;
}

export const PARTNER_CLIENT_TEXT: Record<Locale, PartnerClientText> = {
  az: {
    newClientTitle: (c) => `Yeni müştəri: ${c}`,
    newClientBody: (c) => `${c} sizin linkinizlə Triad Vision-da qeydiyyatdan keçdi və sizin müştəriniz kimi qeyd olundu.`,
    newCaseTitle: (c) => `Yeni müraciət: ${c}`,
    newCaseBody: (c, n) => `Müştəriniz ${c} üçün müraciət ${n} açıldı.`,
    contractTitle: (c) => `Müqavilə imzaya göndərildi: ${c}`,
    contractBody: (c, n) => `Müştəriniz ${c} (müraciət ${n}) müqaviləni imzalamalıdır.`,
    embassyDocsTitle: (c) => `Səfirlik sənədləri lazımdır: ${c}`,
    embassyDocsBody: (c, n) => `Müştəriniz ${c} (müraciət ${n}) üçün səfirlik sənədləri yüklənməlidir.`,
    docsBackTitle: (c) => `Sənədlərdə düzəliş lazımdır: ${c}`,
    docsBackBody: (c, n) => `Müştəriniz ${c} (müraciət ${n}) bəzi sənədləri yenidən yükləməlidir.`,
    cancelledTitle: (c) => `Müraciət ləğv edildi: ${c}`,
    cancelledBody: (c, n) => `Müştəriniz ${c} üçün müraciət ${n} ləğv edildi.`,
    earnedTitle: (a) => `Yeni komissiya: ${a}`,
    earnedBody: (c, n) => `Müştəriniz ${c} (müraciət ${n}) üçün komissiya yaradıldı.`,
    clientsCta: 'Müştərilərə bax',
    inviteTitle: 'Triad Vision şəxsi kabinetiniz yaradıldı',
    inviteBody: (n, p) =>
      `Hörmətli ${n}, partnyorumuz ${p} sizin üçün Triad Vision şəxsi kabineti yaratdı. Kabinetdə Almaniya vizası müraciətinizi izləyə və sənədlərinizi yükləyə bilərsiniz.\n\nŞifrənizi təyin etmək üçün aşağıdakı düyməyə klikləyin (link 7 gün etibarlıdır). Daxil olduqdan sonra məlumatlarınızın ${p} ilə paylaşılmasına razılıq verib-verməməyinizi seçə bilərsiniz.`,
    inviteCta: 'Şifrəni təyin et',
  },
  de: {
    newClientTitle: (c) => `Neuer Kunde: ${c}`,
    newClientBody: (c) => `${c} hat sich über Ihren Link bei Triad Vision registriert und ist Ihnen als Kunde zugeordnet.`,
    newCaseTitle: (c) => `Neuer Antrag: ${c}`,
    newCaseBody: (c, n) => `Für Ihren Kunden ${c} wurde der Antrag ${n} angelegt.`,
    contractTitle: (c) => `Vertrag zur Unterschrift: ${c}`,
    contractBody: (c, n) => `Ihr Kunde ${c} (Antrag ${n}) muss den Vertrag unterschreiben.`,
    embassyDocsTitle: (c) => `Botschaftsunterlagen benötigt: ${c}`,
    embassyDocsBody: (c, n) => `Für Ihren Kunden ${c} (Antrag ${n}) müssen die Botschaftsunterlagen hochgeladen werden.`,
    docsBackTitle: (c) => `Unterlagen nachbessern: ${c}`,
    docsBackBody: (c, n) => `Ihr Kunde ${c} (Antrag ${n}) muss einige Unterlagen erneut hochladen.`,
    cancelledTitle: (c) => `Antrag storniert: ${c}`,
    cancelledBody: (c, n) => `Der Antrag ${n} Ihres Kunden ${c} wurde storniert.`,
    earnedTitle: (a) => `Neue Provision: ${a}`,
    earnedBody: (c, n) => `Für Ihren Kunden ${c} (Antrag ${n}) wurde eine Provision angelegt.`,
    clientsCta: 'Kunden ansehen',
    inviteTitle: 'Ihr Triad-Vision-Kundenkonto wurde angelegt',
    inviteBody: (n, p) =>
      `Hallo ${n}, unser Partner ${p} hat für Sie ein Kundenkonto bei Triad Vision angelegt. Dort verfolgen Sie Ihren Visumantrag für Deutschland und laden Ihre Unterlagen hoch.\n\nKlicken Sie auf die Schaltfläche, um Ihr Passwort festzulegen (der Link ist 7 Tage gültig). Nach der Anmeldung entscheiden Sie, ob Ihre Daten mit ${p} geteilt werden dürfen.`,
    inviteCta: 'Passwort festlegen',
  },
  en: {
    newClientTitle: (c) => `New client: ${c}`,
    newClientBody: (c) => `${c} signed up at Triad Vision with your link and is now listed as your client.`,
    newCaseTitle: (c) => `New application: ${c}`,
    newCaseBody: (c, n) => `Application ${n} was opened for your client ${c}.`,
    contractTitle: (c) => `Contract sent for signature: ${c}`,
    contractBody: (c, n) => `Your client ${c} (application ${n}) needs to sign the contract.`,
    embassyDocsTitle: (c) => `Embassy documents needed: ${c}`,
    embassyDocsBody: (c, n) => `The embassy documents of your client ${c} (application ${n}) need to be uploaded.`,
    docsBackTitle: (c) => `Documents need correcting: ${c}`,
    docsBackBody: (c, n) => `Your client ${c} (application ${n}) needs to upload some documents again.`,
    cancelledTitle: (c) => `Application cancelled: ${c}`,
    cancelledBody: (c, n) => `Application ${n} of your client ${c} was cancelled.`,
    earnedTitle: (a) => `New commission: ${a}`,
    earnedBody: (c, n) => `A commission was created for your client ${c} (application ${n}).`,
    clientsCta: 'View clients',
    inviteTitle: 'Your Triad Vision account was created',
    inviteBody: (n, p) =>
      `Hello ${n}, our partner ${p} created a Triad Vision account for you. There you can follow your German visa application and upload your documents.\n\nClick the button below to set your password (the link is valid for 7 days). After signing in you decide whether your data may be shared with ${p}.`,
    inviteCta: 'Set your password',
  },
  ru: {
    newClientTitle: (c) => `Новый клиент: ${c}`,
    newClientBody: (c) => `${c} зарегистрировался(-ась) в Triad Vision по вашей ссылке и закреплён(а) за вами как клиент.`,
    newCaseTitle: (c) => `Новая заявка: ${c}`,
    newCaseBody: (c, n) => `Для вашего клиента ${c} открыта заявка ${n}.`,
    contractTitle: (c) => `Договор отправлен на подпись: ${c}`,
    contractBody: (c, n) => `Вашему клиенту ${c} (заявка ${n}) нужно подписать договор.`,
    embassyDocsTitle: (c) => `Нужны документы для посольства: ${c}`,
    embassyDocsBody: (c, n) => `Для вашего клиента ${c} (заявка ${n}) нужно загрузить документы для посольства.`,
    docsBackTitle: (c) => `Документы нужно исправить: ${c}`,
    docsBackBody: (c, n) => `Вашему клиенту ${c} (заявка ${n}) нужно заново загрузить некоторые документы.`,
    cancelledTitle: (c) => `Заявка отменена: ${c}`,
    cancelledBody: (c, n) => `Заявка ${n} вашего клиента ${c} отменена.`,
    earnedTitle: (a) => `Новая комиссия: ${a}`,
    earnedBody: (c, n) => `Создана комиссия за вашего клиента ${c} (заявка ${n}).`,
    clientsCta: 'Открыть клиентов',
    inviteTitle: 'Ваш личный кабинет Triad Vision создан',
    inviteBody: (n, p) =>
      `Здравствуйте, ${n}! Наш партнёр ${p} создал для вас личный кабинет Triad Vision. В нём вы можете следить за заявкой на визу в Германию и загружать документы.\n\nНажмите кнопку ниже, чтобы задать пароль (ссылка действительна 7 дней). После входа вы решите, можно ли передавать ваши данные партнёру ${p}.`,
    inviteCta: 'Задать пароль',
  },
};

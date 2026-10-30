import type { Locale } from '@prisma/client';
import type { PermitItem } from './rules.js';

/** Texts of the permit expiry reminders (client and responsible staff), in the recipient's language. */

export interface PermitTextParams {
  item: PermitItem;
  date: string;
  days: number;
}

interface Catalog {
  /** Name of the item ("EU Blue Card"…), also used by the client / admin views. */
  label: Record<PermitItem, string>;
  client: (p: PermitTextParams & { firstName: string }) => { title: string; body: string };
  staff: (p: PermitTextParams & { client: string; number: string }) => { title: string; body: string };
  cta: string;
}

/** What the worker has to do, per item. */
const ACTION: Record<Locale, Record<PermitItem, string>> = {
  az: {
    residence: 'Uzatma üçün Ausländerbehörde-dən (miqrasiya idarəsi) vaxtında termin alın — müddət bitənə qədər müraciət edilməlidir. Menecerniz sənədlərin hazırlanmasında kömək edəcək.',
    blueCard: 'Mavi Kartın uzadılması üçün Ausländerbehörde-dən vaxtında termin alın; iş müqaviləsi və maaş haqqında arayışları hazırlayın. Menecerniz kömək edəcək.',
    passport: 'Yeni pasport üçün Azərbaycan Respublikasının Almaniyadakı səfirliyinə vaxtında müraciət edin — bu bir neçə ay çəkə bilər. Yeni pasportu aldıqdan sonra Ausländerbehörde-yə bildirin və nüsxəsini kabinetinizdə yükləyin.',
    insurance: 'Tibbi sığortanızın davam etdiyini yoxlayın və yeni sığorta təsdiqini (Versicherungsbescheinigung) kabinetinizdə yükləyin — Almaniyada sığortasız qalmaq olmaz.',
  },
  de: {
    residence: 'Bitte vereinbaren Sie rechtzeitig einen Termin bei der Ausländerbehörde — die Verlängerung muss vor dem Ablauf beantragt werden. Ihr Betreuer hilft bei den Unterlagen.',
    blueCard: 'Bitte vereinbaren Sie rechtzeitig einen Termin bei der Ausländerbehörde zur Verlängerung der Blauen Karte und halten Sie Arbeitsvertrag und Gehaltsnachweise bereit. Ihr Betreuer hilft Ihnen.',
    passport: 'Bitte beantragen Sie rechtzeitig einen neuen Pass bei der Botschaft der Republik Aserbaidschan — das kann mehrere Monate dauern. Melden Sie den neuen Pass danach der Ausländerbehörde und laden Sie eine Kopie im Portal hoch.',
    insurance: 'Bitte prüfen Sie, dass Ihre Krankenversicherung weiterläuft, und laden Sie die neue Versicherungsbescheinigung im Portal hoch — in Deutschland ist eine Krankenversicherung Pflicht.',
  },
  en: {
    residence: 'Please book an appointment with the Ausländerbehörde (immigration office) in time — the extension must be applied for before it expires. Your case manager will help with the documents.',
    blueCard: 'Please book an appointment with the Ausländerbehörde in time to extend your Blue Card and have your employment contract and salary statements ready. Your case manager will help.',
    passport: 'Please apply for a new passport at the Embassy of the Republic of Azerbaijan in time — it can take several months. Then report the new passport to the Ausländerbehörde and upload a copy in your account.',
    insurance: 'Please make sure your health insurance continues and upload the new insurance certificate (Versicherungsbescheinigung) in your account — health insurance is mandatory in Germany.',
  },
  ru: {
    residence: 'Пожалуйста, заранее запишитесь в Ausländerbehörde (миграционную службу) — продление нужно подать до окончания срока. Ваш менеджер поможет с документами.',
    blueCard: 'Пожалуйста, заранее запишитесь в Ausländerbehörde для продления Голубой карты и подготовьте трудовой договор и справки о зарплате. Ваш менеджер поможет.',
    passport: 'Пожалуйста, заранее подайте заявление на новый паспорт в Посольство Азербайджанской Республики — это может занять несколько месяцев. Затем сообщите о новом паспорте в Ausländerbehörde и загрузите копию в кабинете.',
    insurance: 'Пожалуйста, убедитесь, что медицинская страховка продлевается, и загрузите новое подтверждение (Versicherungsbescheinigung) в кабинете — в Германии страховка обязательна.',
  },
};

export const PERMIT_TEXTS: Record<Locale, Catalog> = {
  az: {
    label: { residence: 'Yaşayış icazəsi (Aufenthaltstitel)', blueCard: 'AB Mavi Kartı (Blaue Karte EU)', passport: 'Pasport', insurance: 'Tibbi sığorta' },
    client: (p) => {
      const l = PERMIT_TEXTS.az.label[p.item];
      return p.days <= 0
        ? { title: `Müddəti bitib: ${l}`, body: `Salam, ${p.firstName}! ${l} ${p.date} tarixində bitib.\n\n${ACTION.az[p.item]}` }
        : { title: `${l}: ${p.days} gün qalıb`, body: `Salam, ${p.firstName}! ${l} ${p.date} tarixində bitir (${p.days} gün qalıb).\n\n${ACTION.az[p.item]}` };
    },
    staff: (p) => {
      const l = PERMIT_TEXTS.az.label[p.item];
      return {
        title: p.days <= 0 ? `${p.client}: ${l} bitib` : `${p.client}: ${l} ${p.days} günə bitir`,
        body: `${p.client} (${p.number}) — ${l}: ${p.date}${p.days <= 0 ? ' (müddəti bitib)' : ` (${p.days} gün)`}. İşçi ilə əlaqə saxlayın və yenilənməni izləyin.`,
      };
    },
    cta: 'Bax',
  },
  de: {
    label: { residence: 'Aufenthaltstitel', blueCard: 'Blaue Karte EU', passport: 'Reisepass', insurance: 'Krankenversicherung' },
    client: (p) => {
      const l = PERMIT_TEXTS.de.label[p.item];
      return p.days <= 0
        ? { title: `Abgelaufen: ${l}`, body: `Hallo ${p.firstName}, Ihr Dokument „${l}" ist am ${p.date} abgelaufen.\n\n${ACTION.de[p.item]}` }
        : { title: `${l}: noch ${p.days} ${p.days === 1 ? 'Tag' : 'Tage'}`, body: `Hallo ${p.firstName}, Ihr Dokument „${l}" läuft am ${p.date} ab (noch ${p.days} ${p.days === 1 ? 'Tag' : 'Tage'}).\n\n${ACTION.de[p.item]}` };
    },
    staff: (p) => {
      const l = PERMIT_TEXTS.de.label[p.item];
      return {
        title: p.days <= 0 ? `${p.client}: ${l} abgelaufen` : `${p.client}: ${l} läuft in ${p.days} Tagen ab`,
        body: `${p.client} (${p.number}) — ${l}: ${p.date}${p.days <= 0 ? ' (abgelaufen)' : ` (${p.days} Tage)`}. Bitte Kontakt aufnehmen und die Verlängerung begleiten.`,
      };
    },
    cta: 'Ansehen',
  },
  en: {
    label: { residence: 'Residence permit', blueCard: 'EU Blue Card', passport: 'Passport', insurance: 'Health insurance' },
    client: (p) => {
      const l = PERMIT_TEXTS.en.label[p.item];
      return p.days <= 0
        ? { title: `Expired: ${l}`, body: `Hello ${p.firstName}, your ${l.toLowerCase()} expired on ${p.date}.\n\n${ACTION.en[p.item]}` }
        : { title: `${l}: ${p.days} ${p.days === 1 ? 'day' : 'days'} left`, body: `Hello ${p.firstName}, your ${l.toLowerCase()} expires on ${p.date} (${p.days} ${p.days === 1 ? 'day' : 'days'} left).\n\n${ACTION.en[p.item]}` };
    },
    staff: (p) => {
      const l = PERMIT_TEXTS.en.label[p.item];
      return {
        title: p.days <= 0 ? `${p.client}: ${l} expired` : `${p.client}: ${l} expires in ${p.days} days`,
        body: `${p.client} (${p.number}) — ${l}: ${p.date}${p.days <= 0 ? ' (expired)' : ` (${p.days} days)`}. Please get in touch and follow up the renewal.`,
      };
    },
    cta: 'View',
  },
  ru: {
    label: { residence: 'Вид на жительство (Aufenthaltstitel)', blueCard: 'Голубая карта ЕС', passport: 'Паспорт', insurance: 'Медицинская страховка' },
    client: (p) => {
      const l = PERMIT_TEXTS.ru.label[p.item];
      return p.days <= 0
        ? { title: `Срок истёк: ${l}`, body: `Здравствуйте, ${p.firstName}! Срок действия документа «${l}» истёк ${p.date}.\n\n${ACTION.ru[p.item]}` }
        : { title: `${l}: осталось ${p.days} дн.`, body: `Здравствуйте, ${p.firstName}! Срок действия документа «${l}» истекает ${p.date} (осталось ${p.days} дн.).\n\n${ACTION.ru[p.item]}` };
    },
    staff: (p) => {
      const l = PERMIT_TEXTS.ru.label[p.item];
      return {
        title: p.days <= 0 ? `${p.client}: ${l} — срок истёк` : `${p.client}: ${l} истекает через ${p.days} дн.`,
        body: `${p.client} (${p.number}) — ${l}: ${p.date}${p.days <= 0 ? ' (срок истёк)' : ` (${p.days} дн.)`}. Свяжитесь с работником и проследите за продлением.`,
      };
    },
    cta: 'Открыть',
  },
};

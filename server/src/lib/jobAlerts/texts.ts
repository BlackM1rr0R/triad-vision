import type { SeoLocale } from '../seoCatalogue.js';

/** Job alert e-mails and profession names in the six site languages (lib/jobAlerts/service.ts). */

export const PROFESSION_LABELS: Record<string, Record<SeoLocale, string>> = {
  truck_driver: { az: 'Yük maşını sürücüsü', de: 'LKW-Fahrer/in', en: 'Truck driver', ru: 'Водитель грузовика', tr: 'Tır şoförü', uk: 'Водій вантажівки' },
  bus_driver: { az: 'Avtobus sürücüsü', de: 'Busfahrer/in', en: 'Bus driver', ru: 'Водитель автобуса', tr: 'Otobüs şoförü', uk: 'Водій автобуса' },
  courier: { az: 'Kuryer', de: 'Kurierfahrer/in', en: 'Courier', ru: 'Курьер', tr: 'Kurye', uk: 'Кур’єр' },
  nurse: { az: 'Tibb bacısı / baxıcı', de: 'Pflegekraft', en: 'Nurse / carer', ru: 'Медсестра / сиделка', tr: 'Hemşire / bakıcı', uk: 'Медсестра / доглядальниця' },
  cook: { az: 'Aşpaz', de: 'Koch/Köchin', en: 'Cook', ru: 'Повар', tr: 'Aşçı', uk: 'Кухар' },
  waiter: { az: 'Ofisiant', de: 'Servicekraft', en: 'Waiter', ru: 'Официант', tr: 'Garson', uk: 'Офіціант' },
  hotel: { az: 'Otel işçisi', de: 'Hotelfachkraft', en: 'Hotel staff', ru: 'Работник отеля', tr: 'Otel personeli', uk: 'Працівник готелю' },
  baker: { az: 'Çörəkçi', de: 'Bäcker/in', en: 'Baker', ru: 'Пекарь', tr: 'Fırıncı', uk: 'Пекар' },
  butcher: { az: 'Qəssab', de: 'Fleischer/in', en: 'Butcher', ru: 'Мясник', tr: 'Kasap', uk: 'М’ясник' },
  welder: { az: 'Qaynaqçı', de: 'Schweißer/in', en: 'Welder', ru: 'Сварщик', tr: 'Kaynakçı', uk: 'Зварювальник' },
  construction_worker: { az: 'İnşaat işçisi', de: 'Bauarbeiter/in', en: 'Construction worker', ru: 'Строитель', tr: 'İnşaat işçisi', uk: 'Будівельник' },
  electrician: { az: 'Elektrik', de: 'Elektriker/in', en: 'Electrician', ru: 'Электрик', tr: 'Elektrikçi', uk: 'Електрик' },
  plumber: { az: 'Santexnik', de: 'Anlagenmechaniker/in SHK', en: 'Plumber', ru: 'Сантехник', tr: 'Tesisatçı', uk: 'Сантехнік' },
  mechanic: { az: 'Avtomexanik', de: 'Kfz-Mechatroniker/in', en: 'Mechanic', ru: 'Автомеханик', tr: 'Oto tamircisi', uk: 'Автомеханік' },
  carpenter: { az: 'Dülgər / xarrat', de: 'Tischler/in', en: 'Carpenter', ru: 'Столяр / плотник', tr: 'Marangoz', uk: 'Столяр / тесля' },
  painter: { az: 'Rəngsaz', de: 'Maler/in', en: 'Painter', ru: 'Маляр', tr: 'Boyacı', uk: 'Маляр' },
  warehouse: { az: 'Anbar işçisi', de: 'Lagerarbeiter/in', en: 'Warehouse worker', ru: 'Работник склада', tr: 'Depo işçisi', uk: 'Працівник складу' },
  it: { az: 'İT mütəxəssisi', de: 'IT-Fachkraft', en: 'IT specialist', ru: 'IT-специалист', tr: 'BT uzmanı', uk: 'IT-фахівець' },
  agriculture: { az: 'Kənd təsərrüfatı işçisi', de: 'Erntehelfer/in', en: 'Farm worker', ru: 'Сельхозработник', tr: 'Tarım işçisi', uk: 'Сільгоспробітник' },
  cleaner: { az: 'Təmizlikçi', de: 'Reinigungskraft', en: 'Cleaner', ru: 'Уборщик', tr: 'Temizlik görevlisi', uk: 'Прибиральник' },
};

export const professionLabel = (key: string, lng: SeoLocale) => PROFESSION_LABELS[key]?.[lng] ?? PROFESSION_LABELS[key]?.en ?? key;

interface AlertMail {
  confirmSubject: string;
  confirmBody: (professions: string) => string;
  confirmCta: string;
  digestSubject: (n: number) => string;
  digestIntro: (professions: string) => string;
  digestCta: string;
  perMonth: string;
  manage: string;
  unsubscribe: string;
  why: string;
}

export const ALERT_MAIL: Record<SeoLocale, AlertMail> = {
  az: {
    confirmSubject: 'Yeni vakansiyalar barədə bildirişi təsdiqləyin',
    confirmBody: (p) =>
      `Almaniyada yeni vakansiyalar barədə sizə e-poçt göndərməyimizi istədiniz (${p}). Zəhmət olmasa e-poçt ünvanınızı təsdiqləyin — təsdiq olmadan heç nə göndərmirik və sorğu 7 gündən sonra silinir.\n\nBunu siz etməmisinizsə, bu məktubu sadəcə nəzərə almayın.`,
    confirmCta: 'Bildirişi təsdiqlə',
    digestSubject: (n) => `Sizin üçün ${n} yeni vakansiya`,
    digestIntro: (p) => `Bildirişinizə uyğun yeni vakansiyalar (${p}):`,
    digestCta: 'Bütün vakansiyalar',
    perMonth: 'ayda',
    manage: 'Bildirişi dəyişmək',
    unsubscribe: 'Abunəlikdən çıxmaq',
    why: 'Bu məktubu triad-vision.de saytında vakansiya bildirişinə abunə olduğunuz üçün alırsınız. Ən çox gündə bir məktub göndəririk.',
  },
  de: {
    confirmSubject: 'Bitte bestätigen Sie Ihren Job-Alarm',
    confirmBody: (p) =>
      `Sie möchten per E-Mail über neue Stellen in Deutschland informiert werden (${p}). Bitte bestätigen Sie Ihre E-Mail-Adresse — ohne Bestätigung senden wir nichts, und die Anfrage wird nach 7 Tagen gelöscht.\n\nWaren Sie das nicht, ignorieren Sie diese E-Mail einfach.`,
    confirmCta: 'Job-Alarm bestätigen',
    digestSubject: (n) => `${n} neue Stellen für Sie`,
    digestIntro: (p) => `Neue Stellen passend zu Ihrem Job-Alarm (${p}):`,
    digestCta: 'Alle Stellen ansehen',
    perMonth: 'pro Monat',
    manage: 'Job-Alarm ändern',
    unsubscribe: 'Abmelden',
    why: 'Sie erhalten diese E-Mail, weil Sie auf triad-vision.de einen Job-Alarm abonniert haben. Wir senden höchstens eine E-Mail pro Tag.',
  },
  en: {
    confirmSubject: 'Please confirm your job alert',
    confirmBody: (p) =>
      `You asked us to e-mail you about new jobs in Germany (${p}). Please confirm your e-mail address — without confirmation we send nothing, and the request is deleted after 7 days.\n\nIf this was not you, simply ignore this e-mail.`,
    confirmCta: 'Confirm job alert',
    digestSubject: (n) => `${n} new jobs for you`,
    digestIntro: (p) => `New vacancies matching your job alert (${p}):`,
    digestCta: 'See all jobs',
    perMonth: 'per month',
    manage: 'Change job alert',
    unsubscribe: 'Unsubscribe',
    why: 'You receive this e-mail because you subscribed to a job alert on triad-vision.de. We send at most one e-mail per day.',
  },
  ru: {
    confirmSubject: 'Подтвердите подписку на вакансии',
    confirmBody: (p) =>
      `Вы попросили присылать вам письма о новых вакансиях в Германии (${p}). Пожалуйста, подтвердите адрес e-mail — без подтверждения мы ничего не отправляем, а запрос удаляется через 7 дней.\n\nЕсли это были не вы, просто проигнорируйте это письмо.`,
    confirmCta: 'Подтвердить подписку',
    digestSubject: (n) => `Новые вакансии для вас: ${n}`,
    digestIntro: (p) => `Новые вакансии по вашей подписке (${p}):`,
    digestCta: 'Все вакансии',
    perMonth: 'в месяц',
    manage: 'Изменить подписку',
    unsubscribe: 'Отписаться',
    why: 'Вы получили это письмо, потому что подписались на вакансии на triad-vision.de. Мы отправляем не больше одного письма в день.',
  },
  tr: {
    confirmSubject: 'Lütfen iş bildiriminizi onaylayın',
    confirmBody: (p) =>
      `Almanya'daki yeni iş ilanları hakkında size e-posta göndermemizi istediniz (${p}). Lütfen e-posta adresinizi onaylayın — onay olmadan hiçbir şey göndermiyoruz ve talep 7 gün sonra silinir.\n\nBu siz değilseniz bu e-postayı dikkate almayın.`,
    confirmCta: 'İş bildirimini onayla',
    digestSubject: (n) => `Sizin için ${n} yeni iş ilanı`,
    digestIntro: (p) => `İş bildiriminize uygun yeni ilanlar (${p}):`,
    digestCta: 'Tüm ilanlar',
    perMonth: 'aylık',
    manage: 'Bildirimi değiştir',
    unsubscribe: 'Aboneliği iptal et',
    why: 'Bu e-postayı triad-vision.de üzerinde iş bildirimine abone olduğunuz için alıyorsunuz. Günde en fazla bir e-posta göndeririz.',
  },
  uk: {
    confirmSubject: 'Підтвердьте підписку на вакансії',
    confirmBody: (p) =>
      `Ви попросили надсилати вам листи про нові вакансії в Німеччині (${p}). Будь ласка, підтвердьте адресу e-mail — без підтвердження ми нічого не надсилаємо, а запит видаляється через 7 днів.\n\nЯкщо це були не ви, просто проігноруйте цей лист.`,
    confirmCta: 'Підтвердити підписку',
    digestSubject: (n) => `Нові вакансії для вас: ${n}`,
    digestIntro: (p) => `Нові вакансії за вашою підпискою (${p}):`,
    digestCta: 'Усі вакансії',
    perMonth: 'на місяць',
    manage: 'Змінити підписку',
    unsubscribe: 'Відписатися',
    why: 'Ви отримали цей лист, бо підписалися на вакансії на triad-vision.de. Ми надсилаємо не більше одного листа на день.',
  },
};

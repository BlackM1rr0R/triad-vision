import type { L10n } from '../ai/features/caseAi/texts.js';
import type { FormField, FormOption } from './formSchema.js';

/**
 * Ready questionnaires staff can send from the case page. Created in the database on first use (key set,
 * builtIn = true); admins may edit them in the form builder or switch them off, and build their own.
 * Option values of fields mapped to the VIDEX sheet are the German wording the form expects.
 */

const L = (az: string, de: string, en: string, ru: string): L10n => ({ az, de, en, ru });
const o = (value: string, az: string, de: string, en: string, ru: string): FormOption => ({ value, label: L(az, de, en, ru) });

const YES_NO_HELP = null;

export interface BuiltInForm {
  key: string;
  title: L10n;
  description: L10n;
  fields: FormField[];
}

const country: FormField = { key: 'country', type: 'text', required: true, label: L('Ölkə', 'Land', 'Country', 'Страна') };
const from: FormField = { key: 'from', type: 'date', required: true, label: L('Başlanğıc', 'Von', 'From', 'С') };
const to: FormField = { key: 'to', type: 'date', label: L('Son', 'Bis', 'To', 'По'), help: L('Hələ davam edirsə boş saxlayın.', 'Leer lassen, wenn es noch andauert.', 'Leave empty if still ongoing.', 'Оставьте пустым, если продолжается.') };

export const BUILT_IN_FORMS: BuiltInForm[] = [
  {
    key: 'FAMILY',
    title: L('Ailə vəziyyəti', 'Familienstand', 'Family status', 'Семейное положение'),
    description: L(
      'Viza ərizəsi üçün ailə vəziyyətiniz, həyat yoldaşınız və uşaqlarınız haqqında məlumat.',
      'Angaben zu Familienstand, Ehepartner und Kindern für den Visumantrag.',
      'Your marital status, spouse and children for the visa application.',
      'Семейное положение, супруг(а) и дети для визовой анкеты.',
    ),
    fields: [
      {
        key: 'maritalStatus',
        type: 'select',
        required: true,
        target: 'videx.maritalStatus',
        label: L('Ailə vəziyyəti', 'Familienstand', 'Marital status', 'Семейное положение'),
        options: [
          o('ledig', 'Subay', 'Ledig', 'Single', 'Холост / не замужем'),
          o('verheiratet', 'Evli', 'Verheiratet', 'Married', 'Женат / замужем'),
          o('geschieden', 'Boşanmış', 'Geschieden', 'Divorced', 'Разведён(а)'),
          o('verwitwet', 'Dul', 'Verwitwet', 'Widowed', 'Вдовец / вдова'),
        ],
      },
      { key: 'spouseName', type: 'text', required: true, showIf: { field: 'maritalStatus', equals: 'verheiratet' }, label: L('Həyat yoldaşının adı və soyadı', 'Vor- und Nachname des Ehepartners', "Spouse's full name", 'Имя и фамилия супруга(и)') },
      { key: 'spouseBirthDate', type: 'date', showIf: { field: 'maritalStatus', equals: 'verheiratet' }, label: L('Həyat yoldaşının doğum tarixi', 'Geburtsdatum des Ehepartners', "Spouse's date of birth", 'Дата рождения супруга(и)') },
      { key: 'marriageDate', type: 'date', showIf: { field: 'maritalStatus', equals: 'verheiratet' }, label: L('Nikah tarixi', 'Datum der Eheschließung', 'Date of marriage', 'Дата брака') },
      {
        key: 'birthName',
        type: 'text',
        target: 'videx.birthName',
        label: L('Doğulduğu soyad / əvvəlki soyadlar', 'Geburtsname / frühere Namen', 'Surname at birth / former surnames', 'Фамилия при рождении / прежние фамилии'),
        help: L('Soyadınız heç dəyişməyibsə boş saxlayın.', 'Leer lassen, wenn sich Ihr Name nie geändert hat.', 'Leave empty if your name never changed.', 'Оставьте пустым, если фамилия не менялась.'),
      },
      { key: 'hasChildren', type: 'yesno', required: true, help: YES_NO_HELP, label: L('Uşaqlarınız var?', 'Haben Sie Kinder?', 'Do you have children?', 'Есть ли у вас дети?') },
      {
        key: 'children',
        type: 'group',
        required: true,
        maxRows: 12,
        showIf: { field: 'hasChildren', equals: true },
        label: L('Uşaqlar', 'Kinder', 'Children', 'Дети'),
        fields: [
          { key: 'name', type: 'text', required: true, label: L('Ad, soyad', 'Vor- und Nachname', 'Full name', 'Имя, фамилия') },
          { key: 'birthDate', type: 'date', required: true, label: L('Doğum tarixi', 'Geburtsdatum', 'Date of birth', 'Дата рождения') },
        ],
      },
    ],
  },
  {
    key: 'WORK_HISTORY',
    title: L('İş təcrübəsi', 'Berufserfahrung', 'Work experience', 'Опыт работы'),
    description: L(
      'Son illərdəki iş yerləriniz — CV, VIDEX və tanınma üçün.',
      'Ihre Arbeitsstellen der letzten Jahre — für Lebenslauf, VIDEX und Anerkennung.',
      'Your jobs of the last years — for the CV, VIDEX and recognition.',
      'Ваши места работы за последние годы — для резюме, VIDEX и признания.',
    ),
    fields: [
      { key: 'currentPosition', type: 'text', required: true, target: 'profile.profession', label: L('Hazırkı peşəniz / vəzifəniz', 'Derzeitiger Beruf / Position', 'Current profession / position', 'Текущая профессия / должность') },
      { key: 'experienceYears', type: 'number', required: true, target: 'profile.experienceYears', label: L('Ümumi iş təcrübəsi (il)', 'Berufserfahrung insgesamt (Jahre)', 'Total experience (years)', 'Общий стаж (лет)') },
      {
        key: 'employers',
        type: 'group',
        required: true,
        maxRows: 15,
        label: L('İş yerləri (sonuncudan başlayaraq)', 'Arbeitgeber (neueste zuerst)', 'Employers (latest first)', 'Места работы (начиная с последнего)'),
        fields: [
          { key: 'employer', type: 'text', required: true, label: L('İşəgötürən', 'Arbeitgeber', 'Employer', 'Работодатель') },
          { key: 'position', type: 'text', required: true, label: L('Vəzifə', 'Position', 'Position', 'Должность') },
          from,
          to,
          { key: 'duties', type: 'textarea', label: L('Vəzifə öhdəlikləri', 'Aufgaben', 'Duties', 'Обязанности') },
        ],
      },
    ],
  },
  {
    key: 'EDUCATION',
    title: L('Təhsil', 'Ausbildung', 'Education', 'Образование'),
    description: L('Məktəb, peşə təhsili və ali təhsil.', 'Schule, Berufsausbildung und Studium.', 'School, vocational training and university.', 'Школа, профессиональное и высшее образование.'),
    fields: [
      {
        key: 'highest',
        type: 'select',
        required: true,
        target: 'profile.education',
        label: L('Ən yüksək təhsil', 'Höchster Abschluss', 'Highest education', 'Высшее полученное образование'),
        options: [o('school', 'Orta məktəb', 'Schulabschluss', 'School', 'Школа'), o('vocational', 'Peşə təhsili', 'Berufsausbildung', 'Vocational training', 'Профессиональное'), o('university', 'Ali təhsil', 'Hochschulabschluss', 'University degree', 'Высшее')],
      },
      {
        key: 'institutions',
        type: 'group',
        required: true,
        maxRows: 10,
        label: L('Təhsil müəssisələri', 'Bildungseinrichtungen', 'Institutions', 'Учебные заведения'),
        fields: [
          { key: 'name', type: 'text', required: true, label: L('Müəssisə', 'Einrichtung', 'Institution', 'Учреждение') },
          { key: 'specialty', type: 'text', label: L('İxtisas', 'Fachrichtung', 'Field of study', 'Специальность') },
          from,
          to,
          { key: 'diploma', type: 'yesno', label: L('Diplom alınıb?', 'Abschluss erhalten?', 'Diploma received?', 'Диплом получен?') },
        ],
      },
      {
        key: 'germanLevel',
        type: 'select',
        target: 'profile.germanLevel',
        label: L('Alman dili səviyyəsi', 'Deutschkenntnisse', 'German level', 'Уровень немецкого'),
        options: ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((v) => (v === 'none' ? o(v, 'Yoxdur', 'Keine', 'None', 'Нет') : o(v, v, v, v, v))),
      },
    ],
  },
  {
    key: 'PREVIOUS_VISAS',
    title: L('Əvvəlki vizalar və səfərlər', 'Frühere Visa und Reisen', 'Previous visas and trips', 'Прежние визы и поездки'),
    description: L(
      'Son 5 ildə Şengen vizaları, imtinalar və Almaniyada qalışlar — VIDEX bunu soruşur.',
      'Schengen-Visa der letzten 5 Jahre, Ablehnungen und Aufenthalte in Deutschland — VIDEX fragt danach.',
      'Schengen visas of the last 5 years, refusals and stays in Germany — VIDEX asks for this.',
      'Шенгенские визы за 5 лет, отказы и пребывания в Германии — VIDEX спрашивает об этом.',
    ),
    fields: [
      { key: 'hadSchengen', type: 'yesno', required: true, label: L('Son 5 ildə Şengen vizanız olub?', 'Hatten Sie in den letzten 5 Jahren ein Schengen-Visum?', 'Did you have a Schengen visa in the last 5 years?', 'Была ли у вас шенгенская виза за последние 5 лет?') },
      {
        key: 'schengenVisas',
        type: 'group',
        required: true,
        maxRows: 15,
        target: 'videx.previousSchengen',
        showIf: { field: 'hadSchengen', equals: true },
        label: L('Şengen vizaları', 'Schengen-Visa', 'Schengen visas', 'Шенгенские визы'),
        fields: [{ ...country, label: L('Verən ölkə', 'Ausstellendes Land', 'Issuing country', 'Страна выдачи') }, { key: 'visaType', type: 'text', label: L('Viza növü', 'Visumart', 'Visa type', 'Тип визы') }, { ...from, label: L('Etibarlıdır (başlanğıc)', 'Gültig von', 'Valid from', 'Действует с') }, { ...to, help: null, label: L('Etibarlıdır (son)', 'Gültig bis', 'Valid until', 'Действует до') }],
      },
      { key: 'fingerprints', type: 'yesno', target: 'videx.fingerprints', label: L('Şengen vizası üçün barmaq izləriniz alınıb?', 'Wurden Ihnen für ein Schengen-Visum Fingerabdrücke abgenommen?', 'Were your fingerprints taken for a Schengen visa?', 'Сдавали ли вы отпечатки пальцев для шенгенской визы?') },
      { key: 'hadRefusal', type: 'yesno', required: true, label: L('Nə vaxtsa viza imtinası almısınız?', 'Wurde Ihnen jemals ein Visum verweigert?', 'Was a visa ever refused to you?', 'Вам когда-нибудь отказывали в визе?') },
      {
        key: 'refusals',
        type: 'group',
        required: true,
        maxRows: 10,
        showIf: { field: 'hadRefusal', equals: true },
        label: L('İmtinalar', 'Ablehnungen', 'Refusals', 'Отказы'),
        fields: [country, { key: 'year', type: 'number', required: true, label: L('İl', 'Jahr', 'Year', 'Год') }, { key: 'reason', type: 'textarea', label: L('Səbəb (bilirsinizsə)', 'Grund (falls bekannt)', 'Reason (if known)', 'Причина (если известна)') }],
      },
      { key: 'beenToGermany', type: 'yesno', required: true, label: L('Əvvəllər Almaniyada olmusunuz?', 'Waren Sie schon einmal in Deutschland?', 'Have you been to Germany before?', 'Были ли вы раньше в Германии?') },
      {
        key: 'germanyStays',
        type: 'group',
        required: true,
        maxRows: 10,
        target: 'videx.previousGermany',
        showIf: { field: 'beenToGermany', equals: true },
        label: L('Almaniyada qalışlar', 'Aufenthalte in Deutschland', 'Stays in Germany', 'Пребывания в Германии'),
        fields: [from, { ...to, help: null }, { key: 'purpose', type: 'text', required: true, label: L('Məqsəd', 'Zweck', 'Purpose', 'Цель') }],
      },
    ],
  },
  {
    key: 'ADDRESS_HISTORY',
    title: L('Ünvan tarixçəsi', 'Wohnadressen', 'Address history', 'История адресов'),
    description: L('Hazırkı və son 5 ildəki ünvanlarınız.', 'Ihre aktuelle Adresse und die der letzten 5 Jahre.', 'Your current address and those of the last 5 years.', 'Текущий адрес и адреса за последние 5 лет.'),
    fields: [
      { key: 'street', type: 'text', required: true, target: 'profile.address', label: L('Küçə, ev, mənzil', 'Straße, Hausnummer, Wohnung', 'Street, house, flat', 'Улица, дом, квартира'), help: L('Şəxsiyyət vəsiqənizdəki kimi.', 'Wie im Personalausweis.', 'As in your ID card.', 'Как в удостоверении личности.') },
      { key: 'postalCode', type: 'text', target: 'videx.postalCode', label: L('Poçt indeksi', 'Postleitzahl', 'Postal code', 'Почтовый индекс') },
      { key: 'city', type: 'text', required: true, target: 'profile.city', label: L('Şəhər / rayon', 'Ort / Bezirk', 'City / district', 'Город / район') },
      { key: 'since', type: 'date', label: L('Bu ünvanda nə vaxtdan yaşayırsınız?', 'Seit wann wohnen Sie dort?', 'Living there since', 'Живёте по этому адресу с') },
      {
        key: 'previous',
        type: 'group',
        maxRows: 10,
        label: L('Əvvəlki ünvanlar (son 5 il)', 'Frühere Adressen (letzte 5 Jahre)', 'Previous addresses (last 5 years)', 'Прежние адреса (за 5 лет)'),
        fields: [{ key: 'address', type: 'text', required: true, label: L('Ünvan', 'Adresse', 'Address', 'Адрес') }, from, { ...to, help: null }],
      },
    ],
  },
  {
    key: 'HEALTH_INSURANCE',
    title: L('Sağlamlıq sığortası', 'Krankenversicherung', 'Health insurance', 'Медицинская страховка'),
    description: L('Səfər üçün tibbi sığortanız haqqında.', 'Angaben zu Ihrer Reise-Krankenversicherung.', 'About your travel health insurance.', 'О вашей медицинской страховке на поездку.'),
    fields: [
      { key: 'hasInsurance', type: 'yesno', required: true, label: L('Artıq sığortanız var?', 'Haben Sie bereits eine Versicherung?', 'Do you already have insurance?', 'У вас уже есть страховка?') },
      { key: 'insurer', type: 'text', required: true, showIf: { field: 'hasInsurance', equals: true }, label: L('Sığorta şirkəti', 'Versicherer', 'Insurer', 'Страховая компания') },
      { key: 'policyNumber', type: 'text', showIf: { field: 'hasInsurance', equals: true }, label: L('Polis nömrəsi', 'Policennummer', 'Policy number', 'Номер полиса') },
      { key: 'validFrom', type: 'date', required: true, showIf: { field: 'hasInsurance', equals: true }, label: L('Etibarlıdır (başlanğıc)', 'Gültig von', 'Valid from', 'Действует с') },
      { key: 'validTo', type: 'date', required: true, showIf: { field: 'hasInsurance', equals: true }, label: L('Etibarlıdır (son)', 'Gültig bis', 'Valid until', 'Действует до') },
      { key: 'policyFile', type: 'file', showIf: { field: 'hasInsurance', equals: true }, label: L('Sığorta polisi (fayl)', 'Versicherungspolice (Datei)', 'Insurance policy (file)', 'Страховой полис (файл)') },
      { key: 'needHelp', type: 'yesno', showIf: { field: 'hasInsurance', equals: false }, label: L('Sığorta seçməkdə kömək istəyirsiniz?', 'Möchten Sie Hilfe bei der Auswahl?', 'Would you like help choosing one?', 'Нужна помощь с выбором?') },
    ],
  },
];

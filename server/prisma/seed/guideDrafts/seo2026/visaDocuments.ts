import type { Seo2026Guide } from './index.js';

/**
 * Documents for a German work visa (national D visa), per route. Based on the work-visa guide ("Hansı sənədlər
 * lazımdır"), the public checklist (server/src/lib/visaChecklist: Auslandsportal replaces VIDEX for most
 * categories in Baku, original + 1 copy in A4, apostille via ASAN where the embassy asks for it) and the default
 * embassy checklists (lib/ai/features/caseAi/config.ts: 2 biometric photos 35×45 mm, fee 75 € in AZN). We do not
 * translate, do not arrange apostilles and do not book embassy appointments.
 */
export const visaDocumentsGuide: Seo2026Guide = {
  key: 'visa-documents',
  pages: {
    az: {
      slug: 'almaniya-is-vizasi-ucun-senedler',
      title: 'Almaniya iş vizası üçün sənədlər 2026: tam siyahı',
      description:
        'Almaniya iş vizası üçün sənədlər 2026: pasport, foto, Auslandsportal ərizəsi, əmək müqaviləsi, BA forması, tanınma, viza yolları üzrə əlavələr və səhvlər.',
      body: `Almaniyaya iş vizası üçün müraciətdə ən çox vaxt itirilən yer sənədlərdir. Bir sənəd çatışmır, biri köhnədir, biri tərcüməsizdir – və müraciət həftələrlə gecikir. Bu bələdçidə 2026-cı il üçün Almaniya iş vizası (milli D vizası) üçün lazım olan sənədləri ətraflı izah edirik: əsas paket, viza yolları üzrə əlavə sənədlər, tərcümə və apostil məsələsi və ən çox edilən səhvlər.

> Rəsmi siyahı həmişə səfirliyin siyahısıdır. Almaniyanın Bakıdakı səfirliyi milli viza kateqoriyalarının çoxu üçün müraciəti Auslandsportal (digital.diplo.de) vasitəsilə qəbul edir və portalın tələb etdiyi sənəd siyahısı bizim siyahıdan üstündür. Öz vəziyyətiniz üçün siyahını [sənəd siyahısı alətimizdə](/visa-document-checklist) tərtib edə bilərsiniz.

Viza yollarının özü (§ 18a, § 18b, Mavi Kart, § 19c və s.) [Almaniya iş vizası bələdçisində](guide:work-visa) izah olunub. Burada yalnız sənədlərə fokuslanırıq.

## Hər iş vizası üçün əsas sənədlər

Hansı yolla getməyinizdən asılı olmayaraq, demək olar ki, hər müraciətdə bu sənədlər lazımdır:

1. **Onlayn viza ərizəsi.** Kateqoriyaların çoxunda ərizəni Almaniya Xarici İşlər Nazirliyinin konsulluq xidmətləri portalında – **Auslandsportal**-da (digital.diplo.de) özünüz doldurub göndərirsiniz. Bu, köhnə VIDEX formasını əvəz edir. Portal nəyi çap etməyi tələb edirsə, onu çap edib görüşə aparın. Bəzi kateqoriyalar üçün səfirlik başqa yol göstərə bilər; bunu səfirliyin həmin kateqoriya üzrə məlumat vərəqəsi müəyyən edir.
2. **Etibarlı pasport.** Son 10 ildə verilmiş olmalı, ən azı 2 boş səhifəsi olmalı və planlaşdırılan qalış müddətindən sonra da etibarlı qalmalıdır. Məlumat səhifəsinin surətlərini də hazırlayın. Bəzi kateqoriyalarda (məsələn, ailə birləşməsində) səfirlik daha çox boş səhifə istəyə bilər.
3. **Biometrik fotolar.** Adətən 2 ədəd, 35×45 mm, son vaxtlarda çəkilmiş.
4. **Əmək müqaviləsi və ya bağlayıcı iş təklifi.** İmzalanmış olmalıdır. Vəzifə, maaş (brutto), iş saatları və iş yeri aydın yazılmalıdır.
5. **"Erklärung zum Beschäftigungsverhältnis".** Bu, Federal Məşğulluq Agentliyinin (Bundesagentur für Arbeit, BA) formasıdır və onu **işəgötürən** doldurur. BA bu forma əsasında iş şəraitini yoxlayır.
6. **İxtisas sənədləri.** Diplom, əlavəsi (fənlər və saatlar) və lazım olduqda tanınma qərarı (aşağıya baxın).
7. **CV (tərcümeyi-hal).** Adətən alman dilində və imzalı.
8. **İş təcrübəsi arayışları.** Vəzifə, müddət və görülən işlər yazılmış arayışlar.
9. **Dil sertifikatı** – yalnız sizin yolunuz və ya işiniz tələb edirsə (Goethe, telc, ÖSD və s.).
10. **Tibbi sığorta sübutu.** İşə başladığınız gündən dövlət tibbi sığortası işəgötürən vasitəsilə başlayır. Səfirlik adətən Almaniyaya gəlişdən işə başlayana qədərki dövr üçün ayrıca sığorta istəyir.
11. **Viza rüsumu.** Milli viza üçün **75 €**, səfirlikdə manatla ödənilir.

Hər sənədin orijinalını və bir surətini A4 formatında hazırlayın. Sənədləri səfirliyin siyahısındakı ardıcıllıqla düzün – bu, görüşdə vaxt qazandırır.

### Mənzil sübutu lazımdırmı?

Hər iş vizasında mütləq deyil. Bu, viza yolundan və konkret vəziyyətdən asılıdır. Bəzi hallarda işəgötürənin verdiyi mənzilin təsdiqi və ya kirayə müqaviləsi soruşulur. Səfirliyin siyahısında varsa, hazırlayın. Yoxdursa, əlavə sənəd kimi gətirmək olar, amma məcburi deyil.

## Viza yolları üzrə əlavə sənədlər

Əsas paketin üstünə yolunuza görə əlavə sənədlər gəlir.

| Viza yolu | Əlavə sənədlər |
|---|---|
| § 18a – peşə ixtisaslı mütəxəssis | Tanınma qərarı (Anerkennungsbescheid) – peşə ixtisasınızın Almaniyada tam bərabər sayıldığını göstərir |
| § 18b – ali təhsilli mütəxəssis | anabin-də universitetin "H+" statusu və dərəcənin uyğunluğu, ya da ZAB müqayisə arayışı (Zeugnisbewertung); tənzimlənən peşədə tanınma qərarı |
| § 18g – AB Mavi Kartı | § 18b ilə eyni, üstəgəl müqavilədə 2026 üçün ən azı 50.700 € (çatışmayan peşələrdə 45.934,20 €) illik brutto maaş |
| § 18a / § 18b, 45 yaş və yuxarı, ilk dəfə | Maaş illik 55.770 €-dan azdırsa, kifayət qədər pensiya təminatının sübutu |
| § 19c + BeschV (məs. sürücülər) | Sürücülər üçün C/CE vəsiqəsi və sürücülük təcrübəsi arayışları; digər qruplar üçün BeschV-nin tələb etdiyi sübutlar |
| § 19c (2) – təcrübə yolu | Azərbaycanda dövlət tərəfindən tanınan ixtisasın sübutu və son 5 ildə ən azı 2 il təcrübə arayışları |
| § 16a – Ausbildung | İmzalanmış Ausbildung müqaviləsi, məktəb attestatı, adətən B1 alman dili, motivasiya məktubu, lazım olduqda dolanışıq sübutu |
| § 20a – İmkan Kartı | İxtisas sübutu, alman A1 və ya ingilis B2 sertifikatı, xal sübutları, maliyyə sübutu (məs. bloklanmış hesab), bütün qalış üçün sığorta |
| Ailə birləşməsi | Nikah / doğum şəhadətnaməsi, Almaniyadakı ailə üzvünün pasport və yaşayış icazəsi surəti, gəlir sübutu; vəziyyətə görə A1 sertifikatı və mənzil sübutu |

Peşəyə görə də fərqlər var. Tibb bacıları üçün diplom əlavəsində nəzəriyyə və praktika saatları, tanınma qərarı və ya çatışmazlıq qərarı (Defizitbescheid) və adətən B1–B2 alman dili lazımdır – ətraflı: [tibb bacıları üçün səhifə](/for/nurse) və [Pflege bələdçisi](guide:pflege). Aşpazlar üçün diplom və ya kurs sənədi və restoranlardan arayışlar vacibdir ([aşpazlar üçün](/for/cook)). Sürücülər üçün yol [sürücülər səhifəsində](/for/truck-driver) və [sürücü işi bələdçisində](guide:driver-jobs) izah olunub.

## Tanınma qərarı: nə vaxt lazımdır

§ 18a və § 18b yolu ilə getmək istəyirsinizsə, ixtisasınız Almaniyada tanınmalı və ya müqayisəli sayılmalıdır. Peşə təhsili üçün bu, adətən səlahiyyətli qurumun (məsələn, IHK FOSA, sənətkarlıq palatası və ya əyalət qurumu) tanınma qərarıdır. Ali təhsil üçün tənzimlənməyən peşələrdə çox vaxt anabin qeydi və ya ZAB arayışı kifayət edir. Həkim, tibb bacısı kimi tənzimlənən peşələrdə isə peşə icazəsi üçün ayrıca tanınma lazımdır.

Tanınma çox vaxt ən uzun mərhələdir, ona görə onu ilk növbədə başlayın. Hansı qurumun cavabdeh olduğunu [Anerkennung səhifəmizdə](/anerkennung) yoxlayın, prosesi [diplomun tanınması bələdçisində](guide:anerkennung) oxuyun. Təcrübəyə əsaslanan § 19c (2) yolunda isə alman tanınması lazım deyil.

## Tərcümə və apostil: kim edir

Xarici dildə olan sənədlər üçün səfirlik adətən alman dilinə tərcümə istəyir. Bəzi sənədlər, xüsusilə vətəndaşlıq vəziyyəti sənədləri (nikah, doğum şəhadətnaməsi) və diplomlar, üçün **apostil** də tələb oluna bilər. Hansı sənədin tərcümə, hansının apostil tələb etdiyini səfirliyin siyahısı müəyyən edir.

Vacib: **Triad Vision tərcümə etmir və apostil vermir.** Tərcüməni and içmiş tərcüməçiyə (vereidigter Übersetzer) özünüz sifariş edirsiniz. Azərbaycan sənədlərinə apostil səlahiyyətli dövlət qurumunda (ASAN xidmətində) qoyulur və onu da özünüz edirsiniz. Biz isə hansı sənədin tərcümə və ya apostil tələb etdiyini sizinlə birlikdə yoxlayırıq ki, artıq xərc etməyəsiniz və heç nə unudulmasın.

Praktik məsləhət: apostili tərcümədən **əvvəl** qoydurun, çünki apostilin özü də tərcümə olunmalıdır. Tərcümələrdə adlar və tarixlər pasportdakı yazılışla eyni olmalıdır.

## Müraciət addım-addım

1. **Yolu seçin.** Sənəd paketi yola görə dəyişir. [Uyğunluq testi](/eligibility) ilk təsəvvür verir, yolları [viza müqayisəsində](/compare-visas) yan-yana görə bilərsiniz.
2. **Tanınmanı başladın** (yolunuz tələb edirsə).
3. **İş təklifini alın.** İşəgötürən müqaviləni və BA formasını hazırlayır. Uyğun vakansiyalara [vakansiyalar səhifəsində](/jobs) baxın.
4. **Sənədləri toplayın**, tərcümə və apostili (lazım olanlara) özünüz sifariş edin.
5. **Ərizəni Auslandsportal-da doldurun** və səfirlikdə görüş vaxtını özünüz təyin edin. Görüşü biz təyin etmirik.
6. **Görüşə gedin**: orijinallar, surətlər və rüsum yanınızda olsun.
7. **Qərarı gözləyin.** Səfirlik lazım olduqda BA-ya və Almaniyadakı Ausländerbehörde-yə (miqrasiya idarəsi) müraciət edir. Qərarı yalnız səfirlik verir.

İşəgötürən sürətləndirilmiş ixtisaslı işçi prosedurundan (§ 81a AufenthG) istifadə edirsə, o, Almaniyada Ausländerbehörde-dən ilkin razılıq (Vorabzustimmung) alır. Bu halda həmin sənəd də paketə əlavə olunur.

## Ən çox edilən səhvlər

- **Köhnə siyahı ilə işləmək.** Səfirliyin tələbləri dəyişir. Müraciətdən əvvəl Auslandsportal-dakı və səfirlik saytındakı aktual siyahını yoxlayın.
- **Pasportun vaxtı.** Pasport 10 ildən köhnədirsə və ya tezliklə bitirsə, əvvəlcə yeni pasport alın.
- **Yanlış yol üçün sənəd.** Məsələn, tanınma qərarı olmadan § 18a ilə müraciət etmək.
- **Müqavilə ilə BA forması arasında fərq.** Maaş, iş saatları və vəzifə hər iki sənəddə eyni olmalıdır.
- **Qeyri-rəsmi tərcümə.** Tanış adamın etdiyi tərcümə qəbul olunmaya bilər.
- **Apostilin unudulması** və ya tərcümədən sonra qoyulması.
- **Natamam iş təcrübəsi arayışları.** Arayışda yalnız "işləyib" yox, müddət və görülən işlər də yazılmalıdır.
- **Maaş həddini yoxlamamaq** – Mavi Kart və 45 yaşdan yuxarı ilk müraciət üçün.
- **Sığortanın unudulması** – gəlişdən işə başlayana qədərki dövr üçün.

## Viza alındıqdan sonra

Milli viza Almaniyaya giriş üçündür. Gəldikdən sonra Anmeldung (ünvan qeydiyyatı) edir və vizanın vaxtı bitməzdən əvvəl Ausländerbehörde-də yaşayış icazəsinə müraciət edirsiniz. Ona görə orijinal sənədləri Almaniyaya özünüzlə aparın – onlar orada da lazım olacaq. İlk həftələrin planı [ilk ay bələdçisindədir](guide:first-month).

## Triad Vision necə kömək edir

Sənəd paketini sizinlə birlikdə hazırlayırıq: yolunuza uyğun siyahını tərtib edir, hər sənədin tamlığını və uyğunluğunu yoxlayır, müqavilə ilə BA formasının uyğun olub-olmadığına baxırıq. Tərcümə və apostili özünüz sifariş edirsiniz, ərizəni Auslandsportal-da özünüz göndərir və səfirlik görüşünə özünüz gedirsiniz. Qərarı səfirlik verir və heç kim vizaya zəmanət verə bilməz. Amma tam və düzgün paket gecikmə riskini xeyli azaldır. [Pulsuz məsləhət görüşü təyin edin](/booking) və ya **+994 51 414 14 01** nömrəsinə zəng edin.`,
      faq: [
        {
          q: 'Almaniya iş vizası üçün hansı sənədlər mütləq lazımdır?',
          a: 'Onlayn viza ərizəsi, etibarlı pasport, biometrik fotolar, əmək müqaviləsi və ya iş təklifi, işəgötürənin doldurduğu BA forması, ixtisas sənədləri, CV, sığorta sübutu və 75 € rüsum. Yolunuza görə tanınma qərarı və digər sənədlər əlavə olunur.',
        },
        {
          q: 'Sənədləri tərcümə və apostil etdirməkdə kömək edirsinizmi?',
          a: 'Xeyr, Triad Vision tərcümə etmir və apostil vermir. Tərcüməni and içmiş tərcüməçiyə, apostili səlahiyyətli quruma özünüz sifariş edirsiniz. Biz hansı sənədə nə lazım olduğunu birlikdə yoxlayırıq.',
        },
        {
          q: 'Mənzil sübutu lazımdırmı?',
          a: 'Hər iş vizasında mütləq deyil, bu, yoldan və vəziyyətdən asılıdır. Səfirliyin sizin kateqoriya üzrə siyahısında varsa, hazırlamaq lazımdır.',
        },
        {
          q: 'Pasport neçə il etibarlı olmalıdır?',
          a: 'Pasport son 10 ildə verilmiş olmalı, ən azı 2 boş səhifəsi olmalı və qalış müddətindən sonra da etibarlı qalmalıdır. Bitməyə az qalıbsa, əvvəlcə yeni pasport alın.',
        },
        {
          q: 'Səfirlik görüşünü siz təyin edirsinizmi?',
          a: 'Xeyr. Ərizəni Auslandsportal-da özünüz göndərir, səfirlik görüşünü də özünüz təyin edirsiniz. Biz sənədləri sizinlə birlikdə hazırlayır və görüşə hazırlaşmağa kömək edirik.',
        },
        {
          q: 'Milli vizanın rüsumu nə qədərdir?',
          a: '75 €, səfirlikdə manatla ödənilir. Tərcümə, apostil və tanınma xərcləri bura daxil deyil.',
        },
      ],
    },
    ru: {
      slug: 'dokumenty-na-rabochuyu-vizu-v-germaniyu',
      title: 'Документы на рабочую визу в Германию 2026: список',
      description:
        'Документы на рабочую визу в Германию 2026: паспорт, фото, заявление в Auslandsportal, договор, форма BA, признание, документы по типам виз и частые ошибки.',
      body: `Больше всего времени при оформлении рабочей визы в Германию теряется на документах. Одного не хватает, другой устарел, третий без перевода — и подача откладывается на недели. В этом руководстве подробно разбираем, какие документы нужны на рабочую визу в Германию (национальную визу категории D) в 2026 году: базовый пакет, дополнительные документы по каждому визовому пути, переводы и апостиль, а также типичные ошибки.

> Официальный список — всегда список посольства. Посольство Германии в Баку по большинству категорий национальных виз принимает заявления через Auslandsportal (digital.diplo.de), и перечень документов на портале важнее нашего. Свой список под вашу ситуацию можно составить в сервисе [чек-лист документов на визу](/visa-document-checklist).

Сами визовые пути (§ 18a, § 18b, Голубая карта, § 19c и др.) подробно описаны в гиде [рабочая виза в Германию](guide:work-visa). Здесь — только документы.

## Базовый пакет для любой рабочей визы

Независимо от пути, почти в каждом случае нужны:

1. **Онлайн-заявление на визу.** По большинству категорий вы сами заполняете и отправляете его в консульском портале МИД Германии — **Auslandsportal** (digital.diplo.de). Он заменил старую анкету VIDEX. Распечатайте то, что требует портал, и возьмите на приём. Для отдельных категорий посольство может указать другой порядок — это написано в памятке по вашей категории.
2. **Действующий загранпаспорт.** Выдан не более 10 лет назад, минимум 2 чистые страницы, срок действия — дольше планируемого пребывания. Подготовьте копии страницы с данными. По некоторым категориям (например, воссоединение семьи) посольство может просить больше чистых страниц.
3. **Биометрические фото** — обычно 2 штуки, 35×45 мм, свежие.
4. **Трудовой договор или обязывающее предложение о работе** — подписанные, с должностью, зарплатой брутто, рабочим временем и местом работы.
5. **«Erklärung zum Beschäftigungsverhältnis»** — форма Федерального агентства по труду (Bundesagentur für Arbeit, BA), которую заполняет **работодатель**. По ней BA проверяет условия труда.
6. **Документы о квалификации** — диплом, приложение с предметами и часами и, если нужно, решение о признании (см. ниже).
7. **Резюме** — как правило, на немецком и с подписью.
8. **Справки об опыте работы** — с должностью, периодом и описанием обязанностей.
9. **Языковой сертификат** — только если его требует ваш путь или работа (Goethe, telc, ÖSD и др.).
10. **Медицинская страховка.** С первого рабочего дня вы застрахованы в государственной кассе через работодателя. Посольство обычно просит отдельную страховку на период от въезда до начала работы.
11. **Визовый сбор** — **75 €** за национальную визу, оплачивается в посольстве в манатах.

Каждый документ — оригинал плюс одна копия формата A4. Разложите их в порядке списка посольства: это экономит время на приёме.

### Нужно ли подтверждение жилья?

Не на каждую рабочую визу. Это зависит от пути и конкретной ситуации: иногда спрашивают договор аренды или подтверждение жилья от работодателя. Если оно есть в списке посольства — подготовьте. Если нет — можно приложить как дополнительный документ, но это не обязательно.

## Дополнительные документы по визовым путям

К базовому пакету добавляются документы в зависимости от пути.

| Визовый путь | Дополнительно |
|---|---|
| § 18a — специалист с профобразованием | Решение о признании (Anerkennungsbescheid): квалификация признана полностью равноценной немецкой |
| § 18b — специалист с высшим образованием | Статус вуза «H+» в anabin и соответствие степени либо оценка ZAB (Zeugnisbewertung); для регулируемых профессий — признание |
| § 18g — Голубая карта ЕС | Как § 18b, плюс годовая зарплата брутто в договоре не ниже 50 700 € в 2026 году (для дефицитных профессий 45 934,20 €) |
| § 18a / § 18b, первый ВНЖ в 45 лет и старше | Если зарплата ниже 55 770 € в год — подтверждение достаточного пенсионного обеспечения |
| § 19c + BeschV (например, водители) | Для водителей — права C/CE и подтверждение водительского стажа; для других групп — то, что требует BeschV |
| § 19c (2) — путь через опыт | Квалификация, признанная государством в стране получения, и минимум 2 года опыта за последние 5 лет |
| § 16a — Ausbildung | Подписанный договор Ausbildung, аттестат, обычно немецкий B1, мотивационное письмо, при необходимости подтверждение средств |
| § 20a — карта возможностей | Подтверждение квалификации, немецкий A1 или английский B2, подтверждения баллов, финансы (например, блокированный счёт), страховка на весь срок |
| Воссоединение семьи | Свидетельства о браке / рождении, копия паспорта и ВНЖ родственника в Германии, подтверждение дохода; в зависимости от случая — A1 и жильё |

Есть и особенности по профессиям. Медсёстрам нужны приложение к диплому с часами теории и практики, решение о признании или о дефицитах (Defizitbescheid) и обычно немецкий B1–B2 — подробнее на странице [для медсестёр](/for/nurse) и в гиде [Pflege](guide:pflege). Поварам важны диплом или курс и рекомендации ресторанов ([для поваров](/for/cook)). Водителям — страница [для водителей](/for/truck-driver) и гид [работа водителем](guide:driver-jobs).

## Решение о признании: когда оно нужно

Для путей § 18a и § 18b квалификация должна быть признана в Германии или считаться сопоставимой. Для профобразования это решение компетентного органа (например, IHK FOSA, ремесленной палаты или ведомства федеральной земли). Для высшего образования в нерегулируемых профессиях часто достаточно записи в anabin или оценки ZAB. Для регулируемых профессий — врач, медсестра и др. — нужно отдельное признание для допуска к профессии.

Признание часто занимает больше всего времени, поэтому начинайте с него. Какое ведомство отвечает за вашу профессию, можно узнать на странице [признание диплома](/anerkennung), сам процесс описан в гиде [признание диплома в Германии](guide:anerkennung). Для пути через опыт § 19c (2) немецкое признание не нужно.

## Переводы и апостиль: кто этим занимается

Для документов на иностранном языке посольство, как правило, требует перевод на немецкий. Для некоторых документов — особенно свидетельств о браке и рождении, а также дипломов — может понадобиться **апостиль**. Что именно нужно для каждого документа, определяет список посольства.

Важно: **Triad Vision не делает переводы и не проставляет апостиль.** Перевод вы заказываете сами у присяжного переводчика (vereidigter Übersetzer), апостиль — в компетентном государственном органе (в Азербайджане — в службе ASAN). Мы вместе с вами проверяем, каким документам перевод или апостиль действительно нужен, чтобы не тратить лишнего и ничего не забыть.

Практический совет: ставьте апостиль **до** перевода — сам апостиль тоже нужно перевести. Имена и даты в переводах должны совпадать с написанием в паспорте.

## Порядок подачи

1. **Выберите путь** — от него зависит пакет. Первую оценку даст [тест на соответствие](/eligibility), пути можно сравнить в [сравнении виз](/compare-visas).
2. **Начните признание**, если оно нужно.
3. **Получите предложение о работе** — работодатель готовит договор и форму BA. Вакансии — в разделе [вакансии](/jobs).
4. **Соберите документы**, переводы и апостиль закажите сами.
5. **Заполните заявление в Auslandsportal** и сами запишитесь на приём в посольство. Мы на приём не записываем.
6. **Придите на приём** с оригиналами, копиями и сбором.
7. **Ждите решения.** При необходимости посольство запрашивает BA и Ausländerbehörde (ведомство по делам иностранцев) в Германии. Решение принимает только посольство.

Если работодатель использует ускоренную процедуру для специалистов (§ 81a AufenthG), он получает в Ausländerbehörde предварительное согласие (Vorabzustimmung) — этот документ тоже входит в пакет.

## Частые ошибки

- **Старый список.** Требования меняются — перед подачей сверяйтесь с Auslandsportal и сайтом посольства.
- **Паспорт.** Если ему больше 10 лет или он скоро истекает, сначала получите новый.
- **Документы не под тот путь** — например, подача по § 18a без решения о признании.
- **Расхождения между договором и формой BA** — зарплата, часы и должность должны совпадать.
- **Неофициальный перевод** — перевод «знакомого» могут не принять.
- **Забытый апостиль** или апостиль, поставленный уже после перевода.
- **Неполные справки об опыте** — нужны период и обязанности, а не только «работал».
- **Не проверен порог зарплаты** — для Голубой карты и для первого ВНЖ в 45+.
- **Нет страховки** на период от въезда до начала работы.

## После получения визы

Национальная виза — это виза для въезда. После приезда вы делаете Anmeldung (регистрацию по адресу) и до окончания визы подаёте в Ausländerbehörde на вид на жительство. Поэтому оригиналы документов берите с собой — они понадобятся и там. План первых недель — в гиде [первый месяц в Германии](guide:first-month).

## Как помогает Triad Vision

Пакет документов мы готовим вместе с вами: составляем список под ваш путь, проверяем полноту и правильность каждого документа, сверяем договор с формой BA. Переводы и апостиль вы заказываете сами, заявление в Auslandsportal отправляете сами и на приём в посольство идёте сами. Решение принимает посольство, и гарантировать визу не может никто — но полный и аккуратный пакет заметно снижает риск задержек. [Запишитесь на бесплатную консультацию](/booking) или позвоните: **+994 51 414 14 01**.`,
      faq: [
        {
          q: 'Какие документы обязательны для рабочей визы в Германию?',
          a: 'Онлайн-заявление, действующий паспорт, биометрические фото, трудовой договор или предложение, форма BA от работодателя, документы о квалификации, резюме, страховка и сбор 75 €. В зависимости от пути добавляются признание и другие документы.',
        },
        {
          q: 'Вы делаете переводы и апостиль?',
          a: 'Нет. Triad Vision не делает переводы и не проставляет апостиль. Перевод вы заказываете у присяжного переводчика, апостиль — в компетентном органе. Мы помогаем понять, что именно нужно каждому документу.',
        },
        {
          q: 'Нужно ли подтверждение жилья?',
          a: 'Не всегда — это зависит от визового пути и ситуации. Если оно есть в списке посольства для вашей категории, его нужно подготовить.',
        },
        {
          q: 'Каким должен быть паспорт?',
          a: 'Выдан не более 10 лет назад, минимум 2 чистые страницы, действителен дольше срока пребывания. Если срок скоро истекает, сначала оформите новый паспорт.',
        },
        {
          q: 'Вы записываете на приём в посольство?',
          a: 'Нет. Заявление в Auslandsportal и запись на приём вы делаете сами. Мы вместе с вами готовим документы и помогаем подготовиться к приёму.',
        },
        {
          q: 'Сколько стоит национальная виза?',
          a: '75 €, оплата в посольстве в манатах. Переводы, апостиль и признание оплачиваются отдельно.',
        },
      ],
    },
    tr: {
      slug: 'almanya-calisma-vizesi-belgeler',
      title: 'Almanya çalışma vizesi belgeleri 2026: tam liste',
      description:
        'Almanya çalışma vizesi belgeleri 2026: pasaport, fotoğraf, Auslandsportal başvurusu, iş sözleşmesi, BA formu, denklik, vize yollarına göre ekler, hatalar.',
      body: `Almanya çalışma vizesi başvurusunda en çok zaman kaybedilen yer belgelerdir. Biri eksik, biri eski, biri tercümesiz – ve başvuru haftalarca gecikir. Bu rehberde 2026 yılı için Almanya çalışma vizesi (ulusal D vizesi) belgelerini ayrıntılı olarak anlatıyoruz: temel dosya, vize yollarına göre ek belgeler, tercüme ve apostil konusu ve en sık yapılan hatalar.

> Resmî liste her zaman dış temsilciliğin listesidir. Bakü’deki Alman Büyükelçiliği ulusal vize kategorilerinin çoğunda başvuruyu Auslandsportal (digital.diplo.de) üzerinden alır ve portaldaki belge listesi bizim listemizden önce gelir. Türkiye’den başvuranlar kendi bölgelerindeki Alman temsilciliğinin listesine bakmalıdır. Durumunuza göre listeyi [vize belge listesi aracımızla](/visa-document-checklist) oluşturabilirsiniz.

Vize yollarının kendisi (§ 18a, § 18b, Mavi Kart, § 19c vb.) [Almanya çalışma vizesi rehberinde](guide:work-visa) anlatılıyor. Burada yalnızca belgelere odaklanıyoruz.

## Her çalışma vizesi için temel belgeler

Hangi yoldan giderseniz gidin, neredeyse her başvuruda şunlar gerekir:

1. **Çevrim içi vize başvurusu.** Kategorilerin çoğunda başvuruyu Federal Dışişleri Bakanlığı’nın konsolosluk hizmetleri portalı **Auslandsportal**’da (digital.diplo.de) kendiniz doldurup gönderirsiniz. Portal eski VIDEX formunun yerini almıştır. Portalın yazdırmanızı istediği belgeleri yazdırıp randevuya götürün. Bazı kategoriler için temsilcilik farklı bir yol belirtebilir; bunu ilgili kategorinin bilgi notu söyler.
2. **Geçerli pasaport.** Son 10 yıl içinde verilmiş, en az 2 boş sayfalı ve planlanan kalış süresinden sonra da geçerli olmalıdır. Bilgi sayfasının fotokopilerini de hazırlayın. Bazı kategorilerde (örneğin aile birleşiminde) daha fazla boş sayfa istenebilir.
3. **Biyometrik fotoğraflar** – genellikle 2 adet, 35×45 mm, yeni çekilmiş.
4. **İş sözleşmesi veya bağlayıcı iş teklifi** – imzalı; pozisyon, brüt maaş, çalışma saatleri ve iş yeri açıkça yazılı.
5. **"Erklärung zum Beschäftigungsverhältnis"** – Federal İş Ajansı’nın (Bundesagentur für Arbeit, BA) formu; **işveren** doldurur. BA çalışma koşullarını bu forma göre inceler.
6. **Nitelik belgeleri** – diploma, ders ve saatleri gösteren eki ve gerekiyorsa denklik kararı (aşağıya bakın).
7. **Özgeçmiş** – genellikle Almanca ve imzalı.
8. **İş deneyimi belgeleri** – pozisyon, süre ve yapılan işler yazılı olmalı.
9. **Dil sertifikası** – yalnızca yolunuz veya işiniz gerektiriyorsa (Goethe, telc, ÖSD vb.).
10. **Sağlık sigortası.** İşe başladığınız ilk günden itibaren işveren üzerinden yasal sağlık sigortasına girersiniz. Temsilcilik genellikle girişten işe başlangıca kadar olan süre için ayrı bir sigorta ister.
11. **Vize ücreti** – ulusal vize için **75 €**; Bakü’de büyükelçilikte manat olarak ödenir.

Her belgenin aslını ve bir fotokopisini A4 boyutunda hazırlayın. Belgeleri temsilciliğin listesindeki sıraya göre dizin; randevuda zaman kazandırır.

### Konut belgesi gerekli mi?

Her çalışma vizesinde zorunlu değildir; vize yoluna ve somut duruma bağlıdır. Bazen kira sözleşmesi veya işverenin sağladığı konutun teyidi istenir. Temsilciliğin listesinde varsa hazırlayın; yoksa ek belge olarak sunabilirsiniz ama zorunlu değildir.

## Vize yollarına göre ek belgeler

Temel dosyaya yolunuza göre şu belgeler eklenir.

| Vize yolu | Ek belgeler |
|---|---|
| § 18a – meslek eğitimli nitelikli işçi | Denklik kararı (Anerkennungsbescheid): mesleki niteliğinizin Almanya’da tam denk sayıldığını gösterir |
| § 18b – üniversite mezunu nitelikli işçi | anabin’de üniversitenin "H+" statüsü ve derecenin denkliği ya da ZAB değerlendirmesi (Zeugnisbewertung); düzenlenmiş meslekte denklik kararı |
| § 18g – AB Mavi Kartı | § 18b ile aynı, ayrıca sözleşmede 2026 için en az 50.700 € (eleman açığı olan mesleklerde 45.934,20 €) yıllık brüt maaş |
| § 18a / § 18b, 45 yaş ve üzeri, ilk izin | Yıllık maaş 55.770 €’nun altındaysa yeterli emeklilik güvencesi kanıtı |
| § 19c + BeschV (örneğin şoförler) | Şoförler için C/CE ehliyeti ve sürüş deneyimi belgeleri; diğer gruplar için BeschV’nin istediği kanıtlar |
| § 19c (2) – deneyim yolu | Alındığı ülkede devletçe tanınan nitelik ve son 5 yılda en az 2 yıl deneyim belgeleri |
| § 16a – Ausbildung | İmzalı Ausbildung sözleşmesi, okul diploması, genellikle B1 Almanca, motivasyon mektubu, gerekirse geçim kanıtı |
| § 20a – Fırsat Kartı | Nitelik kanıtı, Almanca A1 veya İngilizce B2 sertifikası, puan kanıtları, finansman (örneğin bloke hesap), tüm kalış için sigorta |
| Aile birleşimi | Evlilik / doğum belgesi, Almanya’daki aile üyesinin pasaport ve oturum izni kopyası, gelir kanıtı; duruma göre A1 ve konut belgesi |

Mesleğe göre de farklar vardır. Hemşireler için teori ve pratik saatlerini gösteren diploma eki, denklik veya eksiklik kararı (Defizitbescheid) ve genellikle B1–B2 Almanca gerekir – ayrıntılar [hemşireler sayfasında](/for/nurse) ve [Pflege rehberinde](guide:pflege). Aşçılar için diploma veya kurs belgesi ve restoranlardan referanslar önemlidir ([aşçılar için](/for/cook)). Şoförler için yol [şoförler sayfasında](/for/truck-driver) ve [şoförlük rehberinde](guide:driver-jobs) anlatılıyor.

## Denklik kararı ne zaman gerekir?

§ 18a ve § 18b yollarında niteliğinizin Almanya’da tanınmış veya karşılaştırılabilir olması gerekir. Mesleki eğitim için bu genellikle yetkili kurumun (örneğin IHK FOSA, zanaat odası ya da eyalet kurumu) denklik kararıdır. Düzenlenmemiş mesleklerde üniversite diploması için çoğu zaman anabin kaydı veya ZAB değerlendirmesi yeterlidir. Hekim, hemşire gibi düzenlenmiş mesleklerde ise meslek izni için ayrıca denklik gerekir.

Denklik çoğu zaman en uzun adımdır; bu yüzden ilk iş olarak başlatın. Hangi kurumun yetkili olduğunu [denklik sayfamızda](/anerkennung), süreci [diploma denkliği rehberinde](guide:anerkennung) bulabilirsiniz. Deneyime dayalı § 19c (2) yolunda Alman denkliği gerekmez.

## Tercüme ve apostil: kim yapar?

Yabancı dildeki belgeler için temsilcilik genellikle Almanca tercüme ister. Bazı belgeler için – özellikle doğum ve evlilik belgeleri ile diplomalar – **apostil** de gerekebilir. Hangi belgeye ne gerektiğini temsilciliğin listesi belirler.

Önemli: **Triad Vision tercüme yapmaz ve apostil vermez.** Tercümeyi yeminli tercümana (vereidigter Übersetzer), apostili yetkili resmî makama (Azerbaycan’da ASAN hizmetine) kendiniz yaptırırsınız. Biz ise hangi belgenin tercüme ya da apostil gerektirdiğini sizinle birlikte kontrol ederiz; böylece gereksiz masraf yapmaz, hiçbir şeyi unutmazsınız.

Pratik ipucu: apostili tercümeden **önce** yaptırın, çünkü apostilin kendisi de tercüme edilmelidir. Tercümelerdeki isim ve tarihler pasaporttaki yazılışla aynı olmalıdır.

## Adım adım başvuru

1. **Yolu seçin** – belge dosyası yola göre değişir. [Uygunluk testi](/eligibility) ilk fikri verir; yolları [vize karşılaştırmasında](/compare-visas) yan yana görebilirsiniz.
2. **Denkliği başlatın** (yolunuz gerektiriyorsa).
3. **İş teklifini alın** – işveren sözleşmeyi ve BA formunu hazırlar. İlanlar için [iş ilanları sayfası](/jobs).
4. **Belgeleri toplayın**, tercüme ve apostili kendiniz yaptırın.
5. **Auslandsportal’da başvuruyu doldurun** ve temsilcilik randevusunu kendiniz alın. Randevuyu biz almayız.
6. **Randevuya gidin** – asıllar, fotokopiler ve ücret yanınızda olsun.
7. **Kararı bekleyin.** Temsilcilik gerektiğinde BA’ya ve Almanya’daki Yabancılar Dairesi’ne (Ausländerbehörde) danışır. Kararı yalnızca temsilcilik verir.

İşveren hızlandırılmış nitelikli işçi prosedürünü (§ 81a AufenthG) kullanırsa, Almanya’daki Yabancılar Dairesi’nden ön onay (Vorabzustimmung) alır; bu belge de dosyaya eklenir.

## En sık yapılan hatalar

- **Eski listeyle çalışmak.** Gereklilikler değişir; başvurudan önce Auslandsportal’daki ve temsilcilik sitesindeki güncel listeye bakın.
- **Pasaportun süresi.** 10 yıldan eskiyse ya da yakında doluyorsa önce yeni pasaport alın.
- **Yanlış yol için belge** – örneğin denklik kararı olmadan § 18a ile başvurmak.
- **Sözleşme ile BA formu arasında fark** – maaş, saatler ve pozisyon aynı olmalı.
- **Resmî olmayan tercüme** – bir tanıdığın yaptığı tercüme kabul edilmeyebilir.
- **Apostilin unutulması** ya da tercümeden sonra yaptırılması.
- **Eksik iş deneyimi belgeleri** – yalnızca "çalıştı" değil, süre ve görevler de yazmalı.
- **Maaş sınırını kontrol etmemek** – Mavi Kart ve 45 yaş üstü ilk başvuru için.
- **Sigortayı unutmak** – girişten işe başlangıca kadar olan süre için.

## Vize alındıktan sonra

Ulusal vize Almanya’ya giriş içindir. Vardıktan sonra Anmeldung (adres kaydı) yaptırır ve vizenin süresi dolmadan Yabancılar Dairesi’nde oturum iznine başvurursunuz. Bu yüzden belgelerin asıllarını yanınızda götürün; orada da gerekecek. İlk haftaların planı [ilk ay rehberinde](guide:first-month).

## Triad Vision nasıl yardımcı olur?

Belge dosyasını sizinle birlikte hazırlıyoruz: yolunuza uygun listeyi çıkarıyor, her belgenin eksiksiz ve doğru olup olmadığını kontrol ediyor, sözleşmenin BA formuyla uyumuna bakıyoruz. Tercüme ve apostili siz yaptırıyor, başvuruyu Auslandsportal’dan siz gönderiyor ve randevuya siz gidiyorsunuz. Kararı temsilcilik verir ve kimse vize garantisi veremez; ama eksiksiz ve düzenli bir dosya gecikme riskini belirgin şekilde azaltır. [Ücretsiz danışmanlık randevusu alın](/booking) ya da **+994 51 414 14 01** numarasını arayın.`,
      faq: [
        {
          q: 'Almanya çalışma vizesi için hangi belgeler zorunludur?',
          a: 'Çevrim içi başvuru, geçerli pasaport, biyometrik fotoğraflar, iş sözleşmesi veya teklifi, işverenin doldurduğu BA formu, nitelik belgeleri, özgeçmiş, sigorta ve 75 € ücret. Yolunuza göre denklik kararı ve başka belgeler eklenir.',
        },
        {
          q: 'Tercüme ve apostil işlerini siz yapıyor musunuz?',
          a: 'Hayır. Triad Vision tercüme yapmaz ve apostil vermez. Tercümeyi yeminli tercümana, apostili yetkili makama kendiniz yaptırırsınız. Hangi belgeye ne gerektiğini birlikte kontrol ederiz.',
        },
        {
          q: 'Konut belgesi gerekiyor mu?',
          a: 'Her zaman değil; vize yoluna ve duruma bağlıdır. Temsilciliğin kategorinize ait listesinde varsa hazırlamanız gerekir.',
        },
        {
          q: 'Pasaport nasıl olmalı?',
          a: 'Son 10 yıl içinde verilmiş, en az 2 boş sayfalı ve kalış süresinden sonra da geçerli olmalı. Süresi dolmak üzereyse önce yeni pasaport alın.',
        },
        {
          q: 'Temsilcilik randevusunu siz mi alıyorsunuz?',
          a: 'Hayır. Auslandsportal başvurusunu ve randevuyu kendiniz yaparsınız. Biz belgeleri sizinle birlikte hazırlar ve randevuya hazırlanmanıza yardım ederiz.',
        },
        {
          q: 'Ulusal vize ücreti ne kadar?',
          a: '75 €. Bakü’de büyükelçilikte manat olarak ödenir. Tercüme, apostil ve denklik masrafları buna dahil değildir.',
        },
      ],
    },
  },
};

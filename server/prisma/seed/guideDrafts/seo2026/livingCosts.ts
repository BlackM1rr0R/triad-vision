import type { Seo2026Guide } from './index.js';

/**
 * Monthly living costs in Germany 2026. City ranges: DEFAULT seed rows of server/src/lib/budget/cities.ts
 * (35 m² 1-room / 55 m² 2-room cold rent, utilities per m², WG room all-in, groceries per adult; rounded to 10 €
 * like the table: low down, high up). Fixed costs: lib/budget/params.ts (Deutschlandticket 63 € in 2026,
 * 66.80 € from 2027; Rundfunkbeitrag 18.36 €; SIM 10–25 €; internet 30–45 €; electricity 35–55 €; liability
 * insurance 45–90 €/year; personal spending 80–180 €). Net salary examples: salary-net guide.
 */
export const livingCostsGuide: Seo2026Guide = {
  key: 'living-costs',
  pages: {
    az: {
      slug: 'almaniyada-yasamaq-ucun-ayliq-xercler',
      title: 'Almaniyada yaşamaq üçün aylıq xərclər 2026',
      description:
        'Almaniyada aylıq xərclər 2026: şəhərlər üzrə kirayə, kommunal, ərzaq, nəqliyyat, sığorta, telefon və ailəyə pul göndərmə. Təxmini büdcə nümunələri.',
      body: `Almaniyada işləmək barədə düşünən hər kəs tezliklə eyni suala gəlir: "Maaşım burada yaşamağa çatacaqmı?" Cavab əsasən iki şeydən asılıdır: hansı şəhərdə yaşayacaqsınız və hansı mənzil növünü seçəcəksiniz. Münhendə tək otaqlı mənzilin kirayəsi kiçik şəhərdəkindən iki dəfədən çox baha ola bilər. Ərzaq, nəqliyyat və sığorta isə ölkə üzrə bir-birinə daha yaxındır.

Bu bələdçidə 2026-cı il üçün Almaniyada yaşamaq üçün aylıq xərcləri maddə-maddə izah edirik: kirayə, kommunal xərclər, ərzaq, nəqliyyat, sığorta, telefon və ailəyə pul göndərmək. Sonda böyük şəhər və kiçik şəhər üçün iki təxmini büdcə nümunəsi var.

> Bütün rəqəmlər **təxmini orientirdir**, konkret təklif deyil. Kirayə aralıqları kirayə indekslərinə (Mietspiegel) və 2025-ci il elan portallarına mülayim artım əlavə etməklə hesablanıb. Paylaşılan otaqlar üçün WG-Gesucht / MLP, ərzaq üçün Destatis qiymət məlumatları əsas götürülüb. Öz rəqəmlərinizi [büdcə planlayıcısında](/budget) hesablaya bilərsiniz.

## Maaşdan nə qalır: əvvəlcə netto-nu bilin

Xərcləri planlamazdan əvvəl əlinizə nə qədər pul çatacağını bilmək lazımdır. Almaniyada müqavilədə **brutto** maaş yazılır. Vergi və sosial ödənişlərdən sonra **netto** qalır. Maaşlar bələdçimizdəki nümunələr (I vergi sinfi, uşaqsız, kilsə üzvü deyil, təxmini):

| Brutto (ayda) | Netto (ayda, təxminən) |
|---|---|
| 2.800 € | 1.930–1.960 € |
| 3.000 € | 2.050–2.100 € |

Vacib məqam: işçi kimi **tibbi sığorta üçün ayrıca hesab almırsınız**. Tibbi sığorta, qulluq, pensiya və işsizlik sığortası maaşdan avtomatik tutulur və netto artıq bunlardan sonrakı məbləğdir. Tibbi sığortada işçinin payı 7,3 % üstəgəl kassanın əlavə haqqının yarısıdır (2026-cı ildə orta əlavə haqq 2,9 %). Ətraflı: [Almaniyada maaşlar və vergilər](guide:salary-net). Öz netto-nuzu [maaş kalkulyatorunda](/salary-calculator) yoxlayın.

## Kirayə: ən böyük xərc

Kirayə adətən aylıq büdcənin ən böyük hissəsidir. Almaniyada iki anlayışı ayırmaq lazımdır:

- **Soyuq kirayə (Kaltmiete)** – yalnız mənzilin özü üçün ödəniş.
- **Kommunal xərclər (Nebenkosten)** – istilik, su, zibil, binanın təmizliyi və s. Adətən ev sahibinə aylıq avans kimi ödənilir.
- **İsti kirayə (Warmmiete)** – soyuq kirayə üstəgəl kommunal xərclər.

Elektrik və internet çox vaxt ayrıca müqavilə ilə ödənilir. Tək yaşayan üçün elektrik təxminən ayda 35–55 €, internet 30–45 € təşkil edir.

### Şəhərlər üzrə kirayə cədvəli (2026, təxmini)

Cədvəldə 35 m² tək otaqlı və 55 m² iki otaqlı mənzilin aylıq soyuq kirayəsi, 35 m² üçün kommunal xərclər və paylaşılan mənzildə (WG) bir otağın hər şey daxil qiyməti göstərilir. Məbləğlər 10 €-ya yuvarlaqlaşdırılıb.

| Şəhər | 1 otaq, 35 m² (soyuq) | 2 otaq, 55 m² (soyuq) | Kommunal, 35 m² | WG otağı (hər şey daxil) |
|---|---|---|---|---|
| Münhen | 840–1.090 € | 1.150–1.430 € | 100–140 € | 760–880 € |
| Frankfurt | 630–840 € | 820–1.050 € | 100–130 € | 640–740 € |
| Berlin | 590–810 € | 770–1.050 € | 100–130 € | 600–720 € |
| Hamburq | 590–770 € | 770–990 € | 100–130 € | 600–700 € |
| Ştutqart | 590–770 € | 820–990 € | 100–130 € | 600–700 € |
| Köln | 560–700 € | 710–880 € | 90–130 € | 560–650 € |
| Hannover | 420–530 € | 550–690 € | 90–120 € | 450–530 € |
| Leypsiq | 350–460 € | 440–580 € | 90–120 € | 390–460 € |
| Dortmund | 350–460 € | 460–580 € | 90–120 € | 400–470 € |
| Orta şəhər (20–100 min) | 310–420 € | 440–580 € | 90–120 € | 350–450 € |
| Kiçik şəhər / kənd | 280–390 € | 380–500 € | 80–120 € | 320–400 € |

Məsələn, Berlində 35 m² mənzil üçün kvadratmetri 17–23 € soyuq kirayə ayda təxminən 595–805 € deməkdir. Bunlar ehtiyatlı orientir dəyərlərdir. Böyük şəhərlərdə yeni bağlanan müqavilələr bəzən daha baha olur. Konkret elanı [kirayə yoxlamasında](/rent-check) müqayisə edin, şəhərləri isə [şəhərlər səhifəsində](/cities) yan-yana görün.

### Depozit və işəgötürənin verdiyi otaq

Mənzil kirayələyəndə ev sahibi depozit (Kaution) istəyir. Qanuna görə o, ən çox **3 aylıq soyuq kirayə** ola bilər. Bu pulu ilk aylarda planlamaq lazımdır.

Bəzi işəgötürənlər ilk aylar üçün otaq təklif edir, çox vaxt paylaşılan otaq və hər şey daxil. Bu, adətən WG bazarından ucuz olur. Belə təklif varsa, kirayənin maaşdan necə tutulduğunu müqavilədə yoxlayın.

## Ərzaq və gündəlik xərclər

Bir yetkin üçün ərzaq xərcləri böyük şəhərlərdə ayda təxminən **260–370 €**, kiçik şəhərlərdə **230–300 €** arasındadır (Destatis qiymətləri əsasında təxmini). Aldi, Lidl, Penny və Netto kimi endirimli marketlərdə alış-veriş etsəniz və evdə yemək bişirsəniz, aşağı həddə yaxın qala bilərsiniz. Hər gün kafedə yemək isə büdcəni sürətlə artırır.

Gigiyena vasitələri, geyim və kiçik şəxsi xərclər üçün ayda təxminən 80–180 € planlayın. Bu məbləğ insandan insana çox fərqlənir.

## Nəqliyyat: Deutschlandticket

Almaniyada ictimai nəqliyyat üçün ən sadə həll **Deutschlandticket**-dir. Bu aylıq abunə bütün ölkədə yerli avtobus, tramvay, metro və regional qatarlarda keçərlidir. Qiyməti **2026-cı ildə ayda 63 €**-dur. 1 yanvar 2027-ci ildən **66,80 €** olacaq. Bəzi işəgötürənlər bileti "Jobticket" kimi endirimlə təklif edir.

Kiçik şəhərlərdə və kəndlərdə avtobuslar seyrək işləyə bilər. Növbəli işdə (gecə, səhər tezdən) avtomobil lazım ola bilər. Bu halda yanacaq, sığorta və nəqliyyat vergisi əlavə xərcdir, onları əvvəlcədən hesablayın.

## Sığorta, radio haqqı və telefon

- **Tibbi sığorta** – işçi üçün maaşdan tutulur, ayrıca ödəniş yoxdur (yuxarıya baxın).
- **Şəxsi məsuliyyət sığortası (Haftpflichtversicherung)** – məcburi deyil, amma çox tövsiyə olunur. Tək şəxs üçün ildə təxminən 45–90 €.
- **Radio-televiziya haqqı (Rundfunkbeitrag)** – mənzil başına ayda **18,36 €**. Televizorunuz olmasa da ödənilir. Paylaşılan mənzildə bir dəfə ödənilir və adətən bölünür.
- **Mobil telefon** – SIM kart tarifi ayda təxminən 10–25 €. Azərbaycana zəng üçün xüsusi tarif və ya internet zəngləri ucuz başa gəlir.

## Ailəyə pul göndərmək

Bir çox işçi maaşının bir hissəsini Azərbaycandakı ailəsinə göndərir. Burada xərc iki yerdən yaranır: köçürmə haqqı və valyuta məzənnəsi. Bank köçürməsi, onlayn köçürmə xidmətləri və pul köçürmə şirkətləri arasında fərq böyük ola bilər. "Haqqsız" görünən xidmət bəzən zəif məzənnə ilə qazanır. Hər dəfə göndərilən məbləğin **son nəticədə** nə qədər çatdığını müqayisə edin. Bunun üçün [ailəyə pul göndərmə səhifəmizə](/send-money-home) baxın.

Büdcə planında pul göndərməyi "qalan nə varsa" kimi yox, sabit xərc kimi yazın. Belə olanda gözlənilməz xərclər üçün ehtiyat da qalır.

## Təxmini aylıq büdcə: böyük şəhər və kiçik şəhər

Aşağıdakı iki nümunə yuxarıdakı aralıqlardan qurulub. Bunlar **təxmini** rəqəmlərdir: bir nəfər, avtomobilsiz, tək otaqlı mənzil.

| Xərc (ayda) | Böyük şəhər (Berlin nümunəsi) | Kiçik şəhər |
|---|---|---|
| Soyuq kirayə, 35 m² | 590–810 € | 280–390 € |
| Kommunal xərclər | 100–130 € | 80–120 € |
| Elektrik | 35–55 € | 35–55 € |
| İnternet | 30–45 € | 30–45 € |
| Ərzaq | 260–340 € | 230–300 € |
| Deutschlandticket | 63 € | 63 € |
| Rundfunkbeitrag | 18,36 € | 18,36 € |
| Mobil telefon | 10–25 € | 10–25 € |
| Məsuliyyət sığortası (aylıq payı) | 4–8 € | 4–8 € |
| Şəxsi xərclər | 80–180 € | 80–180 € |
| **Cəmi (təxminən)** | **1.190–1.670 €** | **830–1.200 €** |

Berlində WG otağı seçsəniz (600–720 €, kommunal və internet daxil), cəmi təxminən **1.020–1.340 €** olur.

Bu rəqəmləri netto maaşla müqayisə edin. 2.800 € brutto maaşda netto təxminən 1.930–1.960 €-dur. Böyük şəhərdə tək mənzildə yaşayanda ayda təxminən 260–770 € qalır. Kiçik şəhərdə isə bu fərq xeyli böyükdür. Buna görə ilk illərdə çox adam paylaşılan mənzil, işəgötürənin otağı və ya böyük şəhərin ətrafındakı kiçik yer seçir.

## İlk ay üçün əlavə xərclər

İlk ay adi aydan bahadır. Depozit, mebel, ilk alış-veriş və bəzən bir neçə gün otel lazımdır. İlk maaş isə adətən ilk tam ayın sonunda gəlir. Ona görə yanınızda ən azı 1–2 aylıq xərcə bərabər ehtiyat olmalıdır. Hansı sənədlərin, qeydiyyatların və ödənişlərin ilk həftələrdə gəldiyini [ilk ay bələdçisində](guide:first-month) addım-addım izah etmişik.

## Büdcəni necə azaltmaq olar

- Böyük şəhərin mərkəzi əvəzinə ətrafdakı kiçik şəhərə baxın. Deutschlandticket ilə gediş-gəliş ucuzdur.
- İlk aylar üçün WG və ya işəgötürənin otağı ilə başlayın, sonra sakit şəkildə mənzil axtarın.
- Endirimli marketlərdə alış-veriş edin, nahar üçün evdən yemək götürün.
- Tibbi sığorta kassalarının əlavə haqqını müqayisə edin – fərq hər ay maaşınızda görünür.
- İl sonunda vergi bəyannaməsi verin – iş yolu və köçmə xərcləri vergini azalda bilər.

## Triad Vision necə kömək edir

Biz iş təklifinə baxanda yalnız brutto maaşa deyil, həmin şəhərdə yaşamaq xərclərinə də baxırıq. Sizinlə birlikdə netto maaşı, kirayəni və ilk ayın büdcəsini hesablayırıq ki, qərarı real rəqəmlərlə verəsiniz. Sənədləri birlikdə hazırlayırıq, vizaya isə özünüz müraciət edirsiniz. Qərarı səfirlik verir və heç kim iş və ya vizaya zəmanət verə bilməz. Uyğun vakansiyalara [vakansiyalar səhifəsində](/jobs) baxın, suallarınız üçün [pulsuz məsləhət görüşü təyin edin](/booking) və ya **+994 51 414 14 01** nömrəsinə zəng edin.`,
      faq: [
        {
          q: 'Almaniyada bir nəfər üçün ayda nə qədər pul lazımdır?',
          a: 'Təxminən: böyük şəhərdə tək mənzildə 1.190–1.670 €, kiçik şəhərdə 830–1.200 €. Paylaşılan mənzildə xərclər aşağı olur. Rəqəmlər orientirdir, öz büdcənizi saytımızdakı büdcə planlayıcısında hesablayın.',
        },
        {
          q: 'Tibbi sığorta üçün ayrıca pul ödəməliyəmmi?',
          a: 'İşçi kimi xeyr. Tibbi sığorta maaşdan avtomatik tutulur: 7,3 % üstəgəl kassanın əlavə haqqının yarısı. Netto maaş artıq bu ödənişdən sonrakı məbləğdir.',
        },
        {
          q: 'Deutschlandticket 2026-cı ildə nə qədərdir?',
          a: 'Ayda 63 €. 1 yanvar 2027-ci ildən 66,80 € olacaq. Bilet bütün Almaniyada yerli nəqliyyatda və regional qatarlarda keçərlidir.',
        },
        {
          q: 'Ən ucuz harada yaşamaq olar?',
          a: 'Adətən kiçik şəhərlərdə və şərq şəhərlərində, məsələn Leypsiqdə. Ən baha şəhərlər Münhen, Frankfurt, Berlin və Hamburqdur. Şəhərlər səhifəmizdə onları müqayisə edə bilərsiniz.',
        },
        {
          q: 'Kirayə depoziti nə qədər olur?',
          a: 'Qanuna görə ən çox 3 aylıq soyuq kirayə. Məsələn, 600 € soyuq kirayədə depozit 1.800 €-ya qədər ola bilər. Bu pulu ilk aylar üçün əvvəlcədən planlayın.',
        },
        {
          q: 'Radio haqqını (Rundfunkbeitrag) ödəməliyəmmi?',
          a: 'Bəli, mənzil başına ayda 18,36 €, televizor olmasa da. Paylaşılan mənzildə bir dəfə ödənilir və sakinlər arasında bölünə bilər.',
        },
      ],
    },
    ru: {
      slug: 'stoimost-zhizni-v-germanii',
      title: 'Стоимость жизни в Германии 2026: аренда, еда, транспорт',
      description:
        'Сколько стоит жизнь в Германии в 2026 году: аренда по городам, коммуналка, продукты, транспорт, страховка, связь и переводы домой. Примерные бюджеты.',
      body: `Когда приходит предложение о работе в Германии, первый вопрос почти всегда один: «Хватит ли этой зарплаты на жизнь?» Ответ зависит прежде всего от города и от того, где вы будете жить — в отдельной квартире, в комнате в общей квартире (WG) или в жилье от работодателя. Однокомнатная квартира в Мюнхене может стоить вдвое дороже, чем в небольшом городе. Продукты, транспорт и страховка по стране отличаются гораздо меньше.

В этом руководстве разбираем стоимость жизни в Германии в 2026 году по статьям: аренда, коммунальные платежи, продукты, транспорт, страховки, связь и переводы семье. В конце — два ориентировочных бюджета: для большого города и для маленького.

> Все цифры — **ориентировочные**, а не предложение конкретного жилья. Диапазоны аренды рассчитаны по индексам арендной платы (Mietspiegel) и порталам объявлений 2025 года с умеренной надбавкой; комнаты в WG — по данным WG-Gesucht / MLP; продукты — по ценам Destatis. Свой расчёт можно сделать в [планировщике бюджета](/budget).

## Сначала нетто: сколько остаётся от зарплаты

В немецком договоре указывается **брутто**. После налогов и социальных взносов остаётся **нетто** — именно с ним и нужно сравнивать расходы. Примеры из нашего гида о зарплатах (класс I, без детей, без церковного налога, ориентировочно):

| Брутто в месяц | Нетто в месяц, примерно |
|---|---|
| 2 800 € | 1 930–1 960 € |
| 3 000 € | 2 050–2 100 € |

Важно: наёмный работник **не получает отдельного счёта за медицинскую страховку**. Медицинское, пенсионное, страхование по уходу и по безработице удерживаются из брутто автоматически, нетто — это уже сумма после них. Доля работника в медстраховке — 7,3 % плюс половина дополнительного взноса кассы (средний дополнительный взнос в 2026 году — 2,9 %). Подробно — в гиде [зарплаты в Германии: брутто и нетто](guide:salary-net), свой расчёт — в [калькуляторе зарплаты](/salary-calculator).

## Аренда: главная статья расходов

В объявлениях о жилье встречаются три понятия:

- **Kaltmiete (холодная аренда)** — плата только за саму квартиру.
- **Nebenkosten (коммунальные)** — отопление, вода, вывоз мусора, уборка подъезда и т. п.; платятся арендодателю ежемесячным авансом.
- **Warmmiete (тёплая аренда)** — холодная аренда плюс коммунальные.

Электричество и интернет обычно оформляются отдельными договорами. Для одного человека это ориентировочно 35–55 € за электричество и 30–45 € за интернет в месяц.

### Аренда по городам (2026, ориентировочно)

В таблице — холодная аренда однокомнатной квартиры 35 м² и двухкомнатной 55 м², коммунальные для 35 м² и комната в WG «всё включено». Суммы округлены до 10 €.

| Город | 1 комната, 35 м² (холодная) | 2 комнаты, 55 м² (холодная) | Коммунальные, 35 м² | Комната в WG (всё включено) |
|---|---|---|---|---|
| Мюнхен | 840–1 090 € | 1 150–1 430 € | 100–140 € | 760–880 € |
| Франкфурт | 630–840 € | 820–1 050 € | 100–130 € | 640–740 € |
| Берлин | 590–810 € | 770–1 050 € | 100–130 € | 600–720 € |
| Гамбург | 590–770 € | 770–990 € | 100–130 € | 600–700 € |
| Штутгарт | 590–770 € | 820–990 € | 100–130 € | 600–700 € |
| Кёльн | 560–700 € | 710–880 € | 90–130 € | 560–650 € |
| Ганновер | 420–530 € | 550–690 € | 90–120 € | 450–530 € |
| Лейпциг | 350–460 € | 440–580 € | 90–120 € | 390–460 € |
| Дортмунд | 350–460 € | 460–580 € | 90–120 € | 400–470 € |
| Средний город (20–100 тыс.) | 310–420 € | 440–580 € | 90–120 € | 350–450 € |
| Маленький город / село | 280–390 € | 380–500 € | 80–120 € | 320–400 € |

Пример: в Берлине при 17–23 € за м² холодная аренда квартиры 35 м² — примерно 595–805 € в месяц. Это консервативные ориентиры; новые договоры в больших городах бывают и дороже. Конкретное объявление можно проверить в сервисе [проверки аренды](/rent-check), а города сравнить на странице [города Германии](/cities).

### Залог и жильё от работодателя

Арендодатель просит залог (Kaution) — по закону не больше **трёх холодных арендных плат**. Эти деньги нужно иметь на руках в первые месяцы.

Некоторые работодатели на первое время предлагают комнату — часто общую и «всё включено». Обычно это дешевле рынка WG. Если такой вариант есть, проверьте в договоре, как плата за жильё удерживается из зарплаты.

## Продукты и повседневные расходы

На продукты один взрослый тратит примерно **260–370 € в месяц** в большом городе и **230–300 €** в маленьком (ориентир по ценам Destatis). Если покупать в дискаунтерах — Aldi, Lidl, Penny, Netto — и готовить дома, можно держаться ближе к нижней границе. Ежедневные обеды в кафе быстро увеличивают расходы.

На бытовую химию, одежду и личные мелочи закладывайте ориентировочно 80–180 € в месяц — здесь всё очень индивидуально.

## Транспорт: Deutschlandticket

Самый простой вариант для поездок — **Deutschlandticket**, ежемесячный проездной на весь местный транспорт и региональные поезда по всей Германии. В **2026 году он стоит 63 € в месяц**, с 1 января 2027 года — **66,80 €**. Многие работодатели дают его со скидкой как «Jobticket».

В маленьких городах и сёлах автобусы ходят редко. При сменной работе (ночью или рано утром) может понадобиться машина — тогда добавятся бензин, страховка и транспортный налог.

## Страховки, радиосбор и связь

- **Медицинская страховка** — для работника удерживается из зарплаты, отдельно платить не нужно.
- **Страхование гражданской ответственности (Haftpflichtversicherung)** — не обязательно, но очень рекомендуется; для одного человека примерно 45–90 € в год.
- **Радиосбор (Rundfunkbeitrag)** — **18,36 € в месяц** на квартиру, даже без телевизора. В WG платится один раз за квартиру и обычно делится между жильцами.
- **Мобильная связь** — тариф примерно 10–25 € в месяц. Звонки домой дешевле через интернет-мессенджеры или тарифы с международными минутами.

## Переводы семье

Многие отправляют часть зарплаты родным в Азербайджан или другую страну. Платите вы дважды: комиссией за перевод и курсом обмена. Разница между банковским переводом, онлайн-сервисами и системами денежных переводов бывает заметной, а «бесплатный» перевод иногда зарабатывает на невыгодном курсе. Сравнивайте, **сколько в итоге получит семья**. Для этого есть наша страница [переводы домой](/send-money-home).

Записывайте перевод семье в бюджет как постоянный расход, а не как «то, что останется». Тогда останется и резерв на непредвиденное.

## Примерный бюджет: большой и маленький город

Два примера собраны из диапазонов выше. Это **ориентировочные** цифры: один человек, без машины, однокомнатная квартира.

| Расход в месяц | Большой город (пример Берлина) | Маленький город |
|---|---|---|
| Холодная аренда, 35 м² | 590–810 € | 280–390 € |
| Коммунальные | 100–130 € | 80–120 € |
| Электричество | 35–55 € | 35–55 € |
| Интернет | 30–45 € | 30–45 € |
| Продукты | 260–340 € | 230–300 € |
| Deutschlandticket | 63 € | 63 € |
| Rundfunkbeitrag | 18,36 € | 18,36 € |
| Мобильная связь | 10–25 € | 10–25 € |
| Страхование ответственности (в месяц) | 4–8 € | 4–8 € |
| Личные расходы | 80–180 € | 80–180 € |
| **Итого, примерно** | **1 190–1 670 €** | **830–1 200 €** |

С комнатой в WG в Берлине (600–720 €, коммунальные и интернет включены) выходит примерно **1 020–1 340 €**.

Сравните с нетто: при 2 800 € брутто на руки остаётся около 1 930–1 960 €. В большом городе в отдельной квартире после всех расходов остаётся примерно 260–770 € в месяц, в маленьком городе — заметно больше. Поэтому в первые годы многие выбирают WG, жильё от работодателя или небольшой город рядом с крупным.

## Первый месяц стоит дороже

В первый месяц добавляются залог, мебель, первые покупки, иногда несколько ночей в гостинице. Первая зарплата обычно приходит в конце первого полного месяца, поэтому нужен резерв минимум на 1–2 месяца расходов. Что именно нужно сделать и оплатить в первые недели, мы описали в гиде [переезд в Германию: первый месяц](guide:first-month).

## Как сэкономить

- Смотрите не на центр большого города, а на пригороды и соседние города — с Deutschlandticket дорога недорогая.
- Начните с WG или жилья от работодателя и спокойно ищите квартиру уже на месте.
- Покупайте в дискаунтерах и берите обед с собой.
- Сравните дополнительные взносы больничных касс — разница видна в каждой зарплате.
- Подавайте налоговую декларацию: дорога на работу и расходы на переезд могут снизить налог.

## Как помогает Triad Vision

Оценивая предложение о работе, мы смотрим не только на брутто, но и на стоимость жизни в этом городе. Вместе с вами считаем нетто, аренду и бюджет первого месяца, чтобы решение принималось на реальных цифрах. Документы мы готовим вместе с вами, на визу вы подаёте сами, решение принимает посольство — гарантировать работу или визу не может никто. Актуальные предложения — в разделе [вакансии](/jobs). Остались вопросы? [Запишитесь на бесплатную консультацию](/booking) или позвоните: **+994 51 414 14 01**.`,
      faq: [
        {
          q: 'Сколько денег в месяц нужно одному человеку в Германии?',
          a: 'Ориентировочно 1 190–1 670 € в большом городе в отдельной квартире и 830–1 200 € в маленьком городе. В WG дешевле. Точнее можно посчитать в нашем планировщике бюджета.',
        },
        {
          q: 'Нужно ли отдельно платить за медицинскую страховку?',
          a: 'Работнику — нет. Взнос удерживается из зарплаты: 7,3 % плюс половина дополнительного взноса кассы. Нетто — это уже сумма после всех взносов.',
        },
        {
          q: 'Сколько стоит Deutschlandticket в 2026 году?',
          a: '63 € в месяц. С 1 января 2027 года цена составит 66,80 €. Билет действует на местный транспорт и региональные поезда по всей Германии.',
        },
        {
          q: 'Где в Германии жить дешевле всего?',
          a: 'Обычно в маленьких городах и на востоке страны, например в Лейпциге. Дороже всего Мюнхен, Франкфурт, Берлин и Гамбург. Сравнить города можно на нашей странице городов.',
        },
        {
          q: 'Какой залог берут за квартиру?',
          a: 'По закону не больше трёх холодных арендных плат. При холодной аренде 600 € залог может составить до 1 800 €.',
        },
        {
          q: 'Нужно ли платить радиосбор без телевизора?',
          a: 'Да. Rundfunkbeitrag — 18,36 € в месяц на квартиру, независимо от техники. В WG его платят один раз и делят между жильцами.',
        },
      ],
    },
    tr: {
      slug: 'almanyada-yasam-maliyeti',
      title: 'Almanya’da yaşam maliyeti 2026: kira, market, ulaşım',
      description:
        'Almanya’da yaşam maliyeti 2026: şehirlere göre kira, aidat, market, ulaşım, sigorta, telefon ve memlekete para gönderme. Yaklaşık aylık bütçe örnekleri.',
      body: `Almanya’dan iş teklifi gelince ilk soru genellikle şudur: "Bu maaş orada yaşamaya yeter mi?" Cevap büyük ölçüde iki şeye bağlıdır: hangi şehirde yaşayacağınız ve nasıl bir konutta kalacağınız. Münih’te tek odalı bir dairenin kirası, küçük bir şehirdekinin iki katından fazla olabilir. Market, ulaşım ve sigorta ise ülke genelinde birbirine çok daha yakındır.

Bu rehberde 2026 yılı için Almanya’da yaşam maliyetini kalem kalem ele alıyoruz: kira, yan giderler, market, ulaşım, sigortalar, telefon ve ailenize para göndermek. Sonunda büyük şehir ve küçük şehir için iki yaklaşık bütçe örneği bulacaksınız.

> Tüm rakamlar **yaklaşık değerlerdir**, somut bir konut teklifi değildir. Kira aralıkları kira endeksleri (Mietspiegel) ve 2025 ilan portallarına ılımlı bir artış eklenerek hesaplanmıştır; paylaşımlı oda (WG) fiyatları WG-Gesucht / MLP verilerine, market giderleri Destatis fiyatlarına dayanır. Kendi hesabınızı [bütçe planlayıcısında](/budget) yapabilirsiniz.

## Önce net maaşı bilin

Alman iş sözleşmesinde **brüt** maaş yazar. Vergi ve sosyal sigorta kesintilerinden sonra elinize **net** maaş geçer; giderleri bununla karşılaştırmak gerekir. Maaş rehberimizdeki örnekler (I. vergi sınıfı, çocuksuz, kilise vergisi yok, yaklaşık):

| Aylık brüt | Yaklaşık net |
|---|---|
| 2.800 € | 1.930–1.960 € |
| 3.000 € | 2.050–2.100 € |

Önemli bir nokta: çalışan olarak **sağlık sigortası için ayrı bir fatura almazsınız**. Sağlık, bakım, emeklilik ve işsizlik sigortası primleri brüt maaştan otomatik kesilir; net maaş bu kesintilerden sonraki tutardır. Sağlık sigortasında çalışanın payı %7,3 artı kasanın ek priminin yarısıdır (2026’da ortalama ek prim %2,9). Ayrıntılar [Almanya’da maaşlar ve vergiler](guide:salary-net) rehberinde; kendi netinizi [maaş hesaplayıcısında](/salary-calculator) görebilirsiniz.

## Kira: en büyük gider kalemi

Konut ilanlarında üç kavramla karşılaşırsınız:

- **Kaltmiete (soğuk kira)** – yalnızca dairenin kendisi için ödenen kira.
- **Nebenkosten (yan giderler)** – ısınma, su, çöp, bina temizliği vb.; ev sahibine aylık avans olarak ödenir.
- **Warmmiete (sıcak kira)** – soğuk kira artı yan giderler.

Elektrik ve internet genellikle ayrı sözleşmeyle ödenir. Tek kişi için elektrik aylık yaklaşık 35–55 €, internet 30–45 € tutar.

### Şehirlere göre kiralar (2026, yaklaşık)

Tabloda 35 m² tek odalı ve 55 m² iki odalı dairenin aylık soğuk kirası, 35 m² için yan giderler ve paylaşımlı dairede (WG) her şey dahil bir oda fiyatı yer alıyor. Tutarlar 10 €’ya yuvarlanmıştır.

| Şehir | 1 oda, 35 m² (soğuk) | 2 oda, 55 m² (soğuk) | Yan giderler, 35 m² | WG odası (her şey dahil) |
|---|---|---|---|---|
| Münih | 840–1.090 € | 1.150–1.430 € | 100–140 € | 760–880 € |
| Frankfurt | 630–840 € | 820–1.050 € | 100–130 € | 640–740 € |
| Berlin | 590–810 € | 770–1.050 € | 100–130 € | 600–720 € |
| Hamburg | 590–770 € | 770–990 € | 100–130 € | 600–700 € |
| Stuttgart | 590–770 € | 820–990 € | 100–130 € | 600–700 € |
| Köln | 560–700 € | 710–880 € | 90–130 € | 560–650 € |
| Hannover | 420–530 € | 550–690 € | 90–120 € | 450–530 € |
| Leipzig | 350–460 € | 440–580 € | 90–120 € | 390–460 € |
| Dortmund | 350–460 € | 460–580 € | 90–120 € | 400–470 € |
| Orta büyüklükte şehir (20–100 bin) | 310–420 € | 440–580 € | 90–120 € | 350–450 € |
| Küçük şehir / kırsal | 280–390 € | 380–500 € | 80–120 € | 320–400 € |

Örnek: Berlin’de metrekaresi 17–23 € olan 35 m²’lik bir dairenin soğuk kirası ayda yaklaşık 595–805 €’dur. Bunlar temkinli yönlendirme değerleridir; büyük şehirlerde yeni sözleşmeler daha pahalı olabilir. Somut bir ilanı [kira kontrolünde](/rent-check) karşılaştırın, şehirleri de [şehirler sayfasında](/cities) yan yana görün.

### Depozito ve işverenin sağladığı oda

Ev sahibi depozito (Kaution) ister; yasaya göre bu en fazla **3 aylık soğuk kira** olabilir. Bu parayı ilk aylar için hazır tutmanız gerekir.

Bazı işverenler ilk dönem için oda sağlar; çoğu zaman paylaşımlı ve her şey dahil. Bu genellikle WG piyasasından ucuzdur. Böyle bir teklif varsa kiranın maaştan nasıl kesileceğini sözleşmede kontrol edin.

## Market ve günlük giderler

Bir yetişkinin market gideri büyük şehirlerde ayda yaklaşık **260–370 €**, küçük şehirlerde **230–300 €** civarındadır (Destatis fiyatlarına göre yaklaşık). Aldi, Lidl, Penny ve Netto gibi indirim marketlerinden alışveriş yapıp evde yemek yaparsanız alt sınıra yakın kalabilirsiniz. Her gün dışarıda yemek bütçeyi hızla büyütür.

Temizlik ürünleri, giyim ve kişisel harcamalar için ayda yaklaşık 80–180 € ayırın; bu kalem kişiden kişiye çok değişir.

## Ulaşım: Deutschlandticket

Toplu taşıma için en kolay çözüm **Deutschlandticket**’tır: tüm Almanya’da yerel otobüs, tramvay, metro ve bölgesel trenlerde geçerli aylık abonman. **2026’da aylık 63 €**, 1 Ocak 2027’den itibaren **66,80 €**’dur. Bazı işverenler bileti "Jobticket" olarak indirimli sunar.

Küçük şehirlerde ve kırsalda otobüsler seyrek çalışabilir. Vardiyalı işte (gece ya da sabah erken) araba gerekebilir; o zaman yakıt, sigorta ve motorlu taşıt vergisi de bütçeye eklenir.

## Sigortalar, yayın ücreti ve telefon

- **Sağlık sigortası** – çalışanlar için maaştan kesilir, ayrıca ödenmez.
- **Özel sorumluluk sigortası (Haftpflichtversicherung)** – zorunlu değildir ama şiddetle önerilir; tek kişi için yılda yaklaşık 45–90 €.
- **Yayın ücreti (Rundfunkbeitrag)** – konut başına ayda **18,36 €**, televizyonunuz olmasa bile. WG’de bir kez ödenir ve genellikle paylaşılır.
- **Cep telefonu** – hat tarifesi ayda yaklaşık 10–25 €. Memlekete aramalar internet üzerinden çok daha ucuzdur.

## Memlekete para göndermek

Pek çok çalışan maaşının bir kısmını Türkiye’deki veya Azerbaycan’daki ailesine gönderir. Burada iki maliyet vardır: transfer ücreti ve döviz kuru. Banka havalesi, online transfer hizmetleri ve para transfer şirketleri arasında fark büyük olabilir; "ücretsiz" görünen bir hizmet bazen kötü kurdan kazanır. Her seferinde ailenizin **eline net olarak ne geçtiğini** karşılaştırın. Bunun için [memlekete para gönderme sayfamıza](/send-money-home) bakın.

Para göndermeyi bütçenize "ne kalırsa" olarak değil, sabit bir gider olarak yazın; böylece beklenmedik harcamalar için de yedek kalır.

## Yaklaşık aylık bütçe: büyük şehir ve küçük şehir

Aşağıdaki iki örnek yukarıdaki aralıklardan oluşturulmuştur. Rakamlar **yaklaşıktır**: tek kişi, arabasız, tek odalı daire.

| Aylık gider | Büyük şehir (Berlin örneği) | Küçük şehir |
|---|---|---|
| Soğuk kira, 35 m² | 590–810 € | 280–390 € |
| Yan giderler | 100–130 € | 80–120 € |
| Elektrik | 35–55 € | 35–55 € |
| İnternet | 30–45 € | 30–45 € |
| Market | 260–340 € | 230–300 € |
| Deutschlandticket | 63 € | 63 € |
| Rundfunkbeitrag | 18,36 € | 18,36 € |
| Cep telefonu | 10–25 € | 10–25 € |
| Sorumluluk sigortası (aylık pay) | 4–8 € | 4–8 € |
| Kişisel harcamalar | 80–180 € | 80–180 € |
| **Toplam (yaklaşık)** | **1.190–1.670 €** | **830–1.200 €** |

Berlin’de WG odası seçerseniz (600–720 €, yan giderler ve internet dahil) toplam yaklaşık **1.020–1.340 €** olur.

Bunu net maaşla karşılaştırın: 2.800 € brütte net yaklaşık 1.930–1.960 €’dur. Büyük şehirde tek başına bir dairede yaşarken ayda yaklaşık 260–770 € kalır; küçük şehirde bu fark belirgin şekilde büyüktür. Bu yüzden ilk yıllarda birçok kişi WG, işverenin odası ya da büyük şehrin yakınındaki küçük bir yer seçer.

## İlk ay daha pahalıdır

İlk ayda depozito, mobilya, ilk alışverişler ve bazen birkaç gece otel eklenir. İlk maaş genellikle ilk tam ayın sonunda yatar; bu yüzden en az 1–2 aylık gider kadar yedek paranız olmalıdır. İlk haftalarda hangi işlemleri yapıp neleri ödemeniz gerektiğini [Almanya’ya taşınma: ilk ay](guide:first-month) rehberinde adım adım anlattık.

## Bütçeyi düşürmenin yolları

- Büyük şehrin merkezi yerine çevre ilçelere ve komşu şehirlere bakın; Deutschlandticket ile yol ucuzdur.
- İlk aylarda WG veya işverenin odasıyla başlayın, daireyi orada sakin sakin arayın.
- İndirim marketlerinden alışveriş yapın, öğle yemeğini evden götürün.
- Sağlık kasalarının ek primlerini karşılaştırın; fark her maaşta görünür.
- Yıl sonunda vergi beyannamesi verin; işe gidiş ve taşınma masrafları vergiyi düşürebilir.

## Triad Vision nasıl yardımcı olur?

Bir iş teklifine bakarken yalnızca brüt maaşa değil, o şehirdeki yaşam maliyetine de bakıyoruz. Net maaşı, kirayı ve ilk ayın bütçesini sizinle birlikte hesaplıyoruz ki kararınızı gerçek rakamlarla verin. Belgeleri birlikte hazırlıyoruz, vize başvurusunu siz yapıyorsunuz, kararı büyükelçilik veriyor; kimse iş ya da vize garantisi veremez. Güncel ilanlar [iş ilanları sayfasında](/jobs). Sorularınız için [ücretsiz danışmanlık randevusu alın](/booking) ya da **+994 51 414 14 01** numarasını arayın.`,
      faq: [
        {
          q: 'Almanya’da tek kişi ayda ne kadar harcar?',
          a: 'Yaklaşık olarak büyük şehirde tek başına bir dairede 1.190–1.670 €, küçük şehirde 830–1.200 €. WG’de giderler daha düşüktür. Kendi bütçenizi sitemizdeki bütçe planlayıcısında hesaplayabilirsiniz.',
        },
        {
          q: 'Sağlık sigortasını ayrıca ödemem gerekir mi?',
          a: 'Çalışan olarak hayır. Prim maaştan otomatik kesilir: %7,3 artı kasanın ek priminin yarısı. Net maaş bu kesintiden sonraki tutardır.',
        },
        {
          q: 'Deutschlandticket 2026’da ne kadar?',
          a: 'Aylık 63 €. 1 Ocak 2027’den itibaren 66,80 € olacak. Bilet tüm Almanya’da yerel ulaşımda ve bölgesel trenlerde geçerlidir.',
        },
        {
          q: 'Almanya’da en ucuz nerede yaşanır?',
          a: 'Genellikle küçük şehirlerde ve doğudaki şehirlerde, örneğin Leipzig’de. En pahalıları Münih, Frankfurt, Berlin ve Hamburg’dur. Şehirler sayfamızda karşılaştırabilirsiniz.',
        },
        {
          q: 'Kira depozitosu ne kadar olur?',
          a: 'Yasaya göre en fazla 3 aylık soğuk kira. 600 € soğuk kirada depozito 1.800 €’ya kadar çıkabilir.',
        },
        {
          q: 'Televizyonum yoksa da yayın ücreti öder miyim?',
          a: 'Evet. Rundfunkbeitrag konut başına ayda 18,36 €’dur. WG’de bir kez ödenir ve oturanlar arasında paylaşılabilir.',
        },
      ],
    },
  },
};

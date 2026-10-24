/**
 * Built-in starter texts for the versioned legal documents (lib/legal/documents.ts). They are shown on the
 * public pages until an admin publishes a version (Admin → Legal) and are copied into the first draft.
 * Square-bracket notes ("[prüfen]") are highlighted on the site: they must be checked by a lawyer before
 * the text is published. The German version is binding; the other languages are translations.
 */

type L10n = { az: string; de: string; en: string; ru: string };

export const TERMS_TITLE: L10n = {
  az: 'Ümumi işgüzar şərtlər (AGB)',
  de: 'Allgemeine Geschäftsbedingungen (AGB)',
  en: 'General terms and conditions (AGB)',
  ru: 'Общие условия обслуживания (AGB)',
};

export const TERMS_BODY: L10n = {
  de: `## 1. Geltungsbereich
Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge zwischen Triad Vision [Rechtsform prüfen] („wir“) und Kundinnen und Kunden („Sie“) über Beratungs-, Vermittlungs- und Unterstützungsleistungen rund um Visum, Anerkennung, Arbeit und Ausbildung in Deutschland sowie für die Nutzung des Kundenportals.

## 2. Leistungen
- Wir beraten zu Visum- und Aufenthaltsmöglichkeiten, prüfen und ordnen Ihre Unterlagen und begleiten Sie durch das Verfahren.
- Wir erbringen keine Rechtsberatung im Sinne des Rechtsdienstleistungsgesetzes; wo sie nötig ist, vermitteln wir an zugelassene Rechtsanwältinnen und Rechtsanwälte. [prüfen]
- Die Entscheidung über Visum, Anerkennung oder Arbeitserlaubnis treffen allein die zuständigen Behörden. Ein bestimmtes Ergebnis oder eine Bearbeitungsdauer schulden wir nicht.

## 3. Vertragsschluss
Der Vertrag kommt mit Ihrer Unterschrift unter das Angebot bzw. den Dienstleistungsvertrag oder mit unserer schriftlichen Auftragsbestätigung zustande. Die Registrierung im Portal allein begründet keinen kostenpflichtigen Vertrag.

## 4. Ihre Mitwirkung
- Sie stellen vollständige, wahre und aktuelle Angaben und Unterlagen bereit und informieren uns unverzüglich über Änderungen.
- Verzögerungen oder Ablehnungen wegen fehlender oder unrichtiger Angaben gehen nicht zu unseren Lasten.

## 5. Vergütung und Zahlung
Die Vergütung ergibt sich aus dem jeweiligen Angebot. Gebühren von Behörden, Botschaften, Übersetzern und Prüfstellen sind nicht enthalten, sofern nicht ausdrücklich vereinbart. Rechnungen sind innerhalb von 14 Tagen ohne Abzug fällig. [prüfen]

## 6. Widerrufsrecht für Verbraucher
Verbraucherinnen und Verbraucher haben bei Verträgen, die außerhalb von Geschäftsräumen oder im Fernabsatz geschlossen werden, ein gesetzliches Widerrufsrecht von 14 Tagen. Die Einzelheiten ergeben sich aus der Widerrufsbelehrung, die Ihnen mit dem Vertrag übergeben wird. [Widerrufsbelehrung ergänzen]

## 7. Kundenportal
- Ihre Zugangsdaten sind geheim zu halten. Sie sind für Handlungen unter Ihrem Konto verantwortlich, soweit Sie diese zu vertreten haben.
- Wir dürfen das Portal weiterentwickeln und kurzzeitig für Wartung unterbrechen.

## 8. Haftung
Wir haften unbeschränkt bei Vorsatz, grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Bei leichter Fahrlässigkeit haften wir nur für die Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, vertragstypischen Schaden. [prüfen]

## 9. Kündigung
Beide Seiten können den Vertrag nach Maßgabe des Vertrags bzw. der gesetzlichen Vorschriften kündigen. Bereits erbrachte Leistungen werden anteilig abgerechnet.

## 10. Datenschutz
Wie wir Ihre personenbezogenen Daten verarbeiten, erklärt unsere Datenschutzerklärung.

## 11. Schlussbestimmungen
Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts; zwingende Verbraucherschutzvorschriften Ihres Aufenthaltsstaats bleiben unberührt. Wir nehmen nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil. [prüfen]`,
  en: `## 1. Scope
These general terms and conditions apply to all contracts between Triad Vision [check legal form] ("we") and our clients ("you") for advice, placement and support services relating to visas, recognition, work and vocational training in Germany, and to the use of the client portal.

## 2. Services
- We advise on visa and residence options, check and organise your documents and guide you through the procedure.
- We do not provide legal advice within the meaning of the German Legal Services Act; where it is needed we refer you to admitted lawyers. [check]
- Decisions on visas, recognition or work permits are made solely by the competent authorities. We do not owe a particular outcome or processing time.

## 3. Conclusion of contract
The contract is concluded when you sign the offer or service contract, or with our written order confirmation. Registering in the portal alone does not create a paid contract.

## 4. Your cooperation
- You provide complete, true and up-to-date information and documents and tell us about changes without delay.
- Delays or refusals caused by missing or incorrect information are not our responsibility.

## 5. Fees and payment
Fees are set out in the respective offer. Fees of authorities, embassies, translators and assessment bodies are not included unless expressly agreed. Invoices are payable within 14 days without deduction. [check]

## 6. Right of withdrawal for consumers
Consumers have a statutory 14-day right of withdrawal for contracts concluded off-premises or at a distance. Details are given in the withdrawal notice handed over with the contract. [add withdrawal notice]

## 7. Client portal
- Keep your login details secret. You are responsible for actions under your account to the extent you are at fault.
- We may develop the portal further and briefly interrupt it for maintenance.

## 8. Liability
We are liable without limitation for intent, gross negligence and injury to life, body or health. For slight negligence we are only liable for breaches of essential contractual obligations, limited to the foreseeable damage typical for the contract. [check]

## 9. Termination
Both parties may terminate the contract in accordance with the contract or the statutory provisions. Services already provided are invoiced pro rata.

## 10. Data protection
How we process your personal data is explained in our privacy policy.

## 11. Final provisions
German law applies, excluding the UN Convention on Contracts for the International Sale of Goods; mandatory consumer protection rules of your country of residence remain unaffected. We do not take part in dispute resolution proceedings before a consumer arbitration board. [check]`,
  az: `## 1. Tətbiq dairəsi
Bu ümumi işgüzar şərtlər Triad Vision [hüquqi formanı yoxlayın] ("biz") ilə müştərilər ("siz") arasında Almaniyada viza, diplomun tanınması, iş və peşə təhsili ilə bağlı məsləhət, vasitəçilik və dəstək xidmətlərinə dair bütün müqavilələrə və müştəri portalından istifadəyə şamil edilir.

## 2. Xidmətlər
- Viza və yaşayış imkanları barədə məsləhət veririk, sənədlərinizi yoxlayır və sistemləşdiririk, prosesdə sizi müşayiət edirik.
- Almaniyanın Hüquqi Xidmətlər Qanunu mənasında hüquqi məsləhət vermirik; lazım olduqda sizi lisenziyalı vəkillərə yönləndiririk. [yoxlayın]
- Viza, tanınma və ya iş icazəsi barədə qərarı yalnız səlahiyyətli orqanlar verir. Müəyyən nəticəyə və ya müddətə zəmanət vermirik.

## 3. Müqavilənin bağlanması
Müqavilə təklifi və ya xidmət müqaviləsini imzaladığınız anda, yaxud yazılı sifariş təsdiqimizlə bağlanır. Yalnız portalda qeydiyyat ödənişli müqavilə yaratmır.

## 4. Sizin iştirakınız
- Tam, doğru və aktual məlumat və sənədlər təqdim edir, dəyişikliklər barədə bizə dərhal xəbər verirsiniz.
- Çatışmayan və ya yanlış məlumat səbəbindən yaranan gecikmə və ya imtinaya görə məsuliyyət daşımırıq.

## 5. Ödəniş
Xidmət haqqı müvafiq təklifdə göstərilir. Dövlət orqanlarının, səfirliklərin, tərcüməçilərin və qiymətləndirmə qurumlarının rüsumları, ayrıca razılaşdırılmayıbsa, daxil deyil. Hesablar 14 gün ərzində tam ödənilməlidir. [yoxlayın]

## 6. İstehlakçılar üçün imtina hüququ
İstehlakçılar ofisdən kənarda və ya məsafədən bağlanmış müqavilələr üzrə 14 günlük qanuni imtina hüququna malikdirlər. Təfərrüatlar müqavilə ilə birlikdə verilən imtina bildirişində göstərilir. [imtina bildirişini əlavə edin]

## 7. Müştəri portalı
- Giriş məlumatlarınızı gizli saxlayın. Təqsiriniz olduğu hallarda hesabınız altında edilən hərəkətlərə görə məsuliyyət daşıyırsınız.
- Portalı inkişaf etdirə və texniki xidmət üçün qısa müddətə dayandıra bilərik.

## 8. Məsuliyyət
Qəsd, kobud ehtiyatsızlıq, həyata, bədənə və ya sağlamlığa zərər hallarında tam məsuliyyət daşıyırıq. Yüngül ehtiyatsızlıqda yalnız əsas müqavilə öhdəliklərinin pozulmasına görə və müqavilə üçün tipik, əvvəlcədən görülə bilən zərər həddində məsuliyyət daşıyırıq. [yoxlayın]

## 9. Müqavilənin ləğvi
Tərəflər müqaviləyə və ya qanuna uyğun olaraq müqaviləni ləğv edə bilər. Artıq göstərilmiş xidmətlər proporsional hesablanır.

## 10. Məlumatların qorunması
Şəxsi məlumatlarınızı necə emal etdiyimiz məxfilik siyasətimizdə izah olunur.

## 11. Yekun müddəalar
Almaniya Federativ Respublikasının hüququ tətbiq olunur (BMT-nin Alqı-satqı Konvensiyası istisna olmaqla); yaşadığınız ölkənin məcburi istehlakçı hüquqları qüvvədə qalır. İstehlakçı arbitraj orqanında mübahisələrin həlli prosedurlarında iştirak etmirik. [yoxlayın]`,
  ru: `## 1. Сфера действия
Настоящие общие условия применяются ко всем договорам между Triad Vision [проверить правовую форму] («мы») и клиентами («вы») об услугах консультирования, посредничества и сопровождения по вопросам визы, признания образования, работы и профессионального обучения в Германии, а также к использованию клиентского портала.

## 2. Услуги
- Мы консультируем по визовым возможностям и видам на жительство, проверяем и систематизируем ваши документы и сопровождаем вас в процессе.
- Мы не оказываем юридических услуг в смысле немецкого Закона о правовых услугах; при необходимости направляем вас к допущенным адвокатам. [проверить]
- Решение о визе, признании или разрешении на работу принимают исключительно компетентные органы. Мы не гарантируем определённый результат или срок.

## 3. Заключение договора
Договор заключается с момента подписания вами предложения или договора об оказании услуг либо нашего письменного подтверждения заказа. Сама регистрация на портале не создаёт платного договора.

## 4. Ваше содействие
- Вы предоставляете полные, достоверные и актуальные сведения и документы и незамедлительно сообщаете нам об изменениях.
- Задержки или отказы из-за отсутствующих или неверных сведений не являются нашей ответственностью.

## 5. Оплата
Стоимость указывается в соответствующем предложении. Сборы ведомств, посольств, переводчиков и оценочных органов не включены, если иное прямо не согласовано. Счета подлежат оплате в течение 14 дней без вычетов. [проверить]

## 6. Право отказа для потребителей
Потребители имеют установленное законом право отказаться от договора, заключённого вне офиса или дистанционно, в течение 14 дней. Подробности — в уведомлении о праве отказа, передаваемом вместе с договором. [добавить уведомление]

## 7. Клиентский портал
- Храните данные для входа в тайне. Вы отвечаете за действия в вашем аккаунте, если в них есть ваша вина.
- Мы можем развивать портал и ненадолго прерывать его работу для обслуживания.

## 8. Ответственность
Мы несём неограниченную ответственность за умысел, грубую неосторожность и вред жизни, телу или здоровью. При лёгкой неосторожности мы отвечаем только за нарушение существенных договорных обязанностей и в пределах предвидимого, типичного для договора ущерба. [проверить]

## 9. Расторжение
Стороны могут расторгнуть договор в соответствии с договором или законом. Уже оказанные услуги оплачиваются пропорционально.

## 10. Защита данных
Как мы обрабатываем ваши персональные данные, описано в нашей политике конфиденциальности.

## 11. Заключительные положения
Применяется право Федеративной Республики Германия, за исключением Конвенции ООН о купле-продаже; обязательные нормы защиты потребителей страны вашего проживания сохраняются. Мы не участвуем в процедурах урегулирования споров в потребительской арбитражной комиссии. [проверить]`,
};

export const COOKIES_TITLE: L10n = {
  az: 'Cookie siyasəti',
  de: 'Cookie-Richtlinie',
  en: 'Cookie policy',
  ru: 'Политика cookie',
};

export const COOKIES_BODY: L10n = {
  de: `## Was sind Cookies?
Cookies und ähnliche Technologien (z. B. lokaler Speicher des Browsers) speichern kleine Informationen auf Ihrem Gerät.

## Notwendig (immer aktiv)
- Anmeldesitzung (tv_session): hält Sie im Portal angemeldet.
- Sprache, Darstellung und Ihre Cookie-Auswahl (lokaler Speicher).
Rechtsgrundlage: § 25 Abs. 2 Nr. 2 TDDDG, Art. 6 Abs. 1 lit. b und f DSGVO.

## Statistik (nur mit Einwilligung)
Hilft uns zu verstehen, wie die Website genutzt wird, damit wir sie verbessern können. Wird nur geladen, wenn Sie zustimmen.
- Pseudonyme Besucher-ID (tv.lead, lokaler Speicher): zählt Seitenaufrufe und genutzte Werkzeuge (z. B. Rechner, Eignungstest) und ordnet sie einer späteren Anfrage zu. Gelöscht beim Widerruf, sonst nach 13 Monaten ohne Anfrage.
- Google Analytics 4, falls aktiviert. [Anbieter prüfen]

## Marketing (nur mit Einwilligung)
Misst den Erfolg unserer Werbung. Wird nur geladen, wenn Sie zustimmen. [Anbieter ergänzen]

## Ihre Wahl ändern
Über den Link „Cookie-Einstellungen“ im Fußbereich jeder Seite können Sie Ihre Auswahl jederzeit ändern oder widerrufen (Art. 7 Abs. 3 DSGVO).`,
  en: `## What are cookies?
Cookies and similar technologies (such as the browser's local storage) keep small pieces of information on your device.

## Necessary (always on)
- Login session (tv_session): keeps you signed in to the portal.
- Language, display settings and your cookie choice (local storage).
Legal basis: § 25(2) no. 2 TDDDG, Art. 6(1)(b) and (f) GDPR.

## Statistics (only with consent)
Helps us understand how the website is used so we can improve it. Loaded only if you agree.
- Pseudonymous visitor ID (tv.lead, local storage): counts page views and tools used (e.g. calculators, eligibility test) and links them to a later enquiry. Deleted when you withdraw consent, otherwise after 13 months without an enquiry.
- Google Analytics 4, if enabled. [check provider]

## Marketing (only with consent)
Measures the success of our advertising. Loaded only if you agree. [add provider]

## Changing your choice
Use the "Cookie settings" link in the footer of every page to change or withdraw your choice at any time (Art. 7(3) GDPR).`,
  az: `## Cookie nədir?
Cookie-lər və oxşar texnologiyalar (məsələn, brauzerin lokal yaddaşı) cihazınızda kiçik məlumatlar saxlayır.

## Zəruri (həmişə aktiv)
- Giriş sessiyası (tv_session): portalda daxil olmuş qalmağınızı təmin edir.
- Dil, görünüş ayarları və cookie seçiminiz (lokal yaddaş).
Hüquqi əsas: TDDDG § 25 (2) 2-ci bənd, DSGVO maddə 6 (1) b və f.

## Statistika (yalnız razılıqla)
Saytdan necə istifadə edildiyini anlamağa və onu yaxşılaşdırmağa kömək edir. Yalnız razılıq versəniz yüklənir.
- Psevdonim ziyarətçi ID-si (tv.lead, lokal yaddaş): baxılan səhifələri və istifadə olunan alətləri (məsələn, kalkulyatorlar, uyğunluq testi) sayır və sonrakı müraciətinizlə əlaqələndirir. Razılığı geri götürdükdə, əks halda müraciət olmadan 13 ay sonra silinir.
- Aktiv edilibsə, Google Analytics 4. [provayderi yoxlayın]

## Marketinq (yalnız razılıqla)
Reklamımızın effektivliyini ölçür. Yalnız razılıq versəniz yüklənir. [provayderi əlavə edin]

## Seçiminizi dəyişmək
Hər səhifənin aşağısındakı "Cookie ayarları" linki ilə seçiminizi istənilən vaxt dəyişə və ya geri götürə bilərsiniz (DSGVO maddə 7 (3)).`,
  ru: `## Что такое cookie?
Cookie и похожие технологии (например, локальное хранилище браузера) сохраняют небольшие данные на вашем устройстве.

## Необходимые (всегда включены)
- Сессия входа (tv_session): сохраняет вход в портал.
- Язык, настройки отображения и ваш выбор по cookie (локальное хранилище).
Правовое основание: § 25 абз. 2 п. 2 TDDDG, ст. 6 п. 1 b и f GDPR.

## Статистика (только с согласия)
Помогает понять, как используется сайт, чтобы улучшать его. Загружается только с вашего согласия.
- Псевдонимный ID посетителя (tv.lead, локальное хранилище): считает просмотры страниц и использованные инструменты (например, калькуляторы, тест на соответствие) и связывает их с последующей заявкой. Удаляется при отзыве согласия, иначе через 13 месяцев без заявки.
- Google Analytics 4, если включён. [проверить поставщика]

## Маркетинг (только с согласия)
Измеряет эффективность нашей рекламы. Загружается только с вашего согласия. [указать поставщика]

## Изменить выбор
Ссылка «Настройки cookie» внизу каждой страницы позволяет в любой момент изменить или отозвать выбор (ст. 7 п. 3 GDPR).`,
};

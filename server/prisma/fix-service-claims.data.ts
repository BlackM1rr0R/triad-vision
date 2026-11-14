/**
 * Old → new wording for fix-service-claims.ts (generated 2026-11-14 from the seed / starter edits; see that file).
 *
 * `old` is the text exactly as it was seeded (prisma/seed*, enrich-content.ts, seed/guides, seed/guideDrafts,
 * src/lib/automation/examples.ts, src/lib/training/starter.ts, src/lib/quotes/settings.ts); `new` is the current
 * seed wording. `new: null` removes a list item (e.g. a Service feature) that only advertised apostille / translation.
 * `where` narrows the rows: Service slug, AutomationRule exampleKey or Setting key.
 */
import type { TextFix } from './fix-service-claims.rules.js';

export const TEXT_FIXES: readonly TextFix[] = [
  // seedServices.ts
  { model: "Service", where: "documents", old: "Sənədləşmə və tərcümə", new: "Sənədləşmə və yoxlama" },
  { model: "Service", where: "documents", old: "Dokumente & Übersetzung", new: "Dokumente & Prüfung" },
  { model: "Service", where: "documents", old: "Documents & translation", new: "Documents & review" },
  { model: "Service", where: "documents", old: "Документы и перевод", new: "Документы и проверка" },
  { model: "Service", where: "documents", old: "Sənədlərin toplanması, tərcüməsi, notarial təsdiqi və yoxlanması.", new: "Sənədlərin toplanması, yoxlanması və səfirlik üçün tam paketin hazırlanması." },
  { model: "Service", where: "documents", old: "Zusammenstellung, Übersetzung, Beglaubigung und Prüfung der Unterlagen.", new: "Zusammenstellung und Prüfung der Unterlagen und des vollständigen Pakets für die Botschaft." },
  { model: "Service", where: "documents", old: "Collecting, translating, certifying and checking your documents.", new: "Collecting and checking your documents and preparing the complete embassy document set." },
  { model: "Service", where: "documents", old: "Сбор, перевод, нотариальное заверение и проверка документов.", new: "Сбор и проверка документов и подготовка полного пакета для посольства." },
  { model: "Service", where: "documents", old: "Ona görə hər sənədi standartlara uyğun hazırlayırıq: and içmiş tərcüməçilər tərəfindən alman dilinə tərcümə, notarial təsdiq və lazım olduqda apostil.", new: "Ona görə hər sənədi tələblərə uyğun yoxlayır və səfirliyin tələb etdiyi tam sənəd paketini hazırlayırıq. Apostil və tərcüməni özünüz etdirirsiniz (məs., ASAN xidmətdə və and içmiş tərcüməçidə)." },
  { model: "Service", where: "documents", old: "Deshalb bereiten wir jedes Dokument normgerecht vor: beeidigte Übersetzung ins Deutsche, notarielle Beglaubigung und bei Bedarf Apostille.", new: "Deshalb prüfen wir jedes Dokument auf die Anforderungen und stellen das vollständige Paket zusammen, das die Botschaft verlangt. Apostille und beglaubigte Übersetzungen lassen Sie selbst anfertigen." },
  { model: "Service", where: "documents", old: "So we prepare every document to standard: sworn translation into German, notarisation and an apostille where needed.", new: "So we check every document against the requirements and prepare the complete set of documents the embassy requires. You have the apostille and sworn translations done yourself." },
  { model: "Service", where: "documents", old: "Поэтому мы готовим каждый документ по стандарту: присяжный перевод на немецкий, нотариальное заверение и при необходимости апостиль.", new: "Поэтому мы проверяем каждый документ на соответствие требованиям и готовим полный пакет документов, который требует посольство. Апостиль и заверенный перевод вы оформляете самостоятельно." },
  { model: "Service", where: "documents", old: "And içmiş tərcüməçi ilə tərcümə", new: "Səfirlik üçün tam sənəd paketi" },
  { model: "Service", where: "documents", old: "Notarial təsdiq və apostil", new: null },
  { model: "Service", where: "documents", old: "Beeidigte Übersetzung", new: "Vollständiges Paket für die Botschaft" },
  { model: "Service", where: "documents", old: "Beglaubigung und Apostille", new: null },
  { model: "Service", where: "documents", old: "Sworn translation", new: "Complete embassy document set" },
  { model: "Service", where: "documents", old: "Notarisation and apostille", new: null },
  { model: "Service", where: "documents", old: "Присяжный перевод", new: "Полный пакет для посольства" },
  { model: "Service", where: "documents", old: "Нотариальное заверение и апостиль", new: null },
  { model: "Service", where: "visa-support", old: "Bundesagentur razılığı, səfirlik görüşü və müraciətin izlənməsi.", new: "Bundesagentur razılığı, səfirlik üçün sənəd paketi və müraciətin izlənməsi." },
  { model: "Service", where: "visa-support", old: "Zustimmung der Bundesagentur, Botschaftstermin und Nachverfolgung.", new: "Zustimmung der Bundesagentur, Unterlagen für die Botschaft und Nachverfolgung." },
  { model: "Service", where: "visa-support", old: "Federal Employment Agency approval, embassy appointment and tracking.", new: "Federal Employment Agency approval, the embassy document set and tracking." },
  { model: "Service", where: "visa-support", old: "Согласие Bundesagentur, запись в посольство и отслеживание заявки.", new: "Согласие Bundesagentur, пакет документов для посольства и отслеживание заявки." },
  { model: "Service", where: "visa-support", old: "səfirlik sənəd paketinin hazırlanması və görüşün təyin edilməsi.", new: "səfirliyin tələb etdiyi tam sənəd paketinin hazırlanıb sizə verilməsi. Müraciəti səfirliyə özünüz edirsiniz, görüş vaxtını və qərarı səfirlik özü bildirir." },
  { model: "Service", where: "visa-support", old: "das Antragspaket für die Botschaft und die Terminvereinbarung.", new: "die vollständigen Unterlagen, die die Botschaft verlangt. Den Antrag stellen Sie selbst bei der Botschaft – Termin und Entscheidung kommen von der Botschaft." },
  { model: "Service", where: "visa-support", old: "the fast-track procedure (§81a) where useful, the embassy document package and the appointment.", new: "the fast-track procedure (§81a) where useful, and the complete set of documents the embassy requires, which we hand to you. You apply to the embassy yourself; the embassy itself gives you the appointment and the decision." },
  { model: "Service", where: "visa-support", old: "пакет документов для посольства и запись на приём.", new: "полный пакет документов для посольства, который мы передаём вам. Заявление в посольство вы подаёте сами, дату приёма и решение сообщает само посольство." },
  // seed.ts
  { model: "Faq", old: "Bütün inzibati prosesi biz koordinasiya edirik: Bundesagentur für Arbeit, Ausländerbehörde və səfirliklə yazışmalar daxil olmaqla.", new: "Bütün inzibati prosesi biz koordinasiya edirik: Bundesagentur für Arbeit və Ausländerbehörde ilə yazışmalar daxil olmaqla. Səfirlik üçün tam sənəd paketini hazırlayıb namizədə veririk; müraciəti səfirliyə namizəd özü edir." },
  { model: "Faq", old: "Wir koordinieren den gesamten Verwaltungsprozess – inklusive Kommunikation mit Bundesagentur für Arbeit, Ausländerbehörde und Botschaft.", new: "Wir koordinieren den gesamten Verwaltungsprozess – inklusive Kommunikation mit Bundesagentur für Arbeit und Ausländerbehörde. Die vollständigen Unterlagen für die Botschaft stellen wir der Fachkraft zusammen; den Visumantrag stellt sie selbst bei der Botschaft." },
  { model: "Faq", old: "We coordinate the whole administrative process, including communication with the Federal Employment Agency, the immigration office and the embassy.", new: "We coordinate the whole administrative process, including communication with the Federal Employment Agency and the immigration office. We prepare the complete embassy document set for the candidate, who then applies to the embassy themselves." },
  { model: "Faq", old: "Мы координируем весь административный процесс, включая переписку с Bundesagentur für Arbeit, Ausländerbehörde и посольством.", new: "Мы координируем весь административный процесс, включая переписку с Bundesagentur für Arbeit и Ausländerbehörde. Полный пакет документов для посольства мы готовим и передаём кандидату, заявление в посольство он подаёт сам." },
  // enrich-content.ts
  { model: "Service", where: "documents", old: "Andlı tərcümə, notarial təsdiq və lazım olduqda apostil təşkil edirik", new: "Hansı sənədlərə apostil və ya tərcümə lazım olduğunu deyirik – onları özünüz etdirirsiniz" },
  { model: "Service", where: "documents", old: "Wir organisieren beeidigte Übersetzung, Beglaubigung und, falls nötig, Apostille", new: "Wir sagen Ihnen, welche Dokumente Apostille oder beglaubigte Übersetzung brauchen – anfertigen lassen Sie diese selbst" },
  { model: "Service", where: "documents", old: "We arrange sworn translation, certification and an apostille where needed", new: "We tell you which documents need an apostille or sworn translation – you have these done yourself" },
  { model: "Service", where: "documents", old: "Организуем присяжный перевод, заверение и при необходимости апостиль", new: "Подсказываем, каким документам нужен апостиль или заверенный перевод, – оформляете их вы сами" },
  { model: "Service", where: "visa-support", old: "Səfirlik üçün sənəd paketini tərtib edir və görüş təyin edirik", new: "Səfirliyin tələb etdiyi tam sənəd paketini hazırlayıb sizə veririk; müraciəti səfirliyə özünüz edirsiniz, görüş vaxtını səfirlik özü bildirir" },
  { model: "Service", where: "visa-support", old: "Wir stellen die Unterlagen für die Botschaft zusammen und buchen den Termin", new: "Wir stellen Ihnen die vollständigen Unterlagen für die Botschaft zusammen; den Antrag stellen Sie selbst, den Termin vergibt die Botschaft" },
  { model: "Service", where: "visa-support", old: "We compile the embassy document package and book the appointment", new: "We prepare and give you the complete embassy document set; you apply to the embassy yourself and the embassy gives you the appointment" },
  { model: "Service", where: "visa-support", old: "Собираем пакет документов для посольства и записываемся на приём", new: "Готовим и передаём вам полный пакет документов для посольства; заявление вы подаёте сами, дату приёма назначает посольство" },
  // seed/contractTemplates.ts
  { model: "ContractTemplate", old: "- Prüfung und Zusammenstellung der Unterlagen\n- Unterstützung bei der Arbeitgeber- bzw. Ausbildungsplatzsuche", new: "- Prüfung und Zusammenstellung der Unterlagen, die die Auslandsvertretung verlangt; den Visumantrag stellt der/die Auftraggeber/in selbst\n- Unterstützung bei der Arbeitgeber- bzw. Ausbildungsplatzsuche" },
  // seed/guides/anerkennung.ts
  { model: "GuidePage", old: "tərcümə və müraciəti planlaşdırır, nəticədən asılı olaraq viza strategiyasını qururuq.", new: "müraciəti planlaşdırır, nəticədən asılı olaraq viza strategiyasını qururuq. Tərcümə və apostili özünüz etdirirsiniz." },
  { model: "GuidePage", old: "koordiniert Übersetzungen und Antrag und plant den passenden Aufenthaltstitel – für Bewerber ebenso wie für Arbeitgeber, die internationale Fachkräfte gewinnen wollen.", new: "bereitet den Antrag vor und plant den passenden Aufenthaltstitel – für Bewerber ebenso wie für Arbeitgeber, die internationale Fachkräfte gewinnen wollen. Übersetzungen und Apostille lassen Sie selbst anfertigen." },
  { model: "GuidePage", old: "organise translations and the application, and plan the right visa route based on the result.", new: "prepare the application, and plan the right visa route based on the result. You have the translations and any apostille done yourself." },
  { model: "GuidePage", old: "организуем переводы и подачу, а затем выстраиваем визовую стратегию в зависимости от результата.", new: "готовим заявление, а затем выстраиваем визовую стратегию в зависимости от результата. Переводы и апостиль вы оформляете самостоятельно." },
  { model: "GuidePage", old: "çeviri ve başvuruyu organize ediyor, sonuca göre doğru vize yolunu planlıyoruz.", new: "başvuruyu hazırlıyor, sonuca göre doğru vize yolunu planlıyoruz. Çeviri ve apostili kendiniz yaptırırsınız." },
  { model: "GuidePage", old: "організовуємо переклади й подання, а потім вибудовуємо візову стратегію залежно від результату.", new: "готуємо заяву, а потім вибудовуємо візову стратегію залежно від результату. Переклади й апостиль ви оформлюєте самостійно." },
  // seed/guides/familiennachzug.ts
  { model: "GuidePage", old: "Bakıdakı ofisimiz ailələrə sənəd siyahısını hazırlamaqda, tərcümə və apostil prosesində, səfirlik növbəsinə hazırlıqda və Almaniyadakı işəgötürənlə əlaqədə dəstək olur.", new: "Bakıdakı ofisimiz ailələr üçün sənəd siyahısını və səfirliyin tələb etdiyi tam sənəd paketini hazırlayır, Almaniyadakı işəgötürənlə əlaqədə dəstək olur. Tərcümə və apostili, həmçinin səfirliyə müraciəti özünüz edirsiniz; görüş vaxtını və qərarı səfirlik bildirir." },
  { model: "GuidePage", old: "Unser Team in Baku begleitet Familien bei Unterlagen, Übersetzungen, Terminvorbereitung und Abstimmung mit dem Arbeitgeber.", new: "Unser Team in Baku stellt Familien die vollständigen Unterlagen zusammen, die die Botschaft verlangt, und stimmt sich mit dem Arbeitgeber ab. Übersetzungen, Apostillen und den Antrag bei der Botschaft erledigen Sie selbst; Termin und Entscheidung kommen von der Botschaft." },
  { model: "GuidePage", old: "Our team in Baku supports families with document lists, translations and apostilles, appointment preparation and coordination with the employer in Germany.", new: "Our team in Baku prepares the document list and the complete set of documents the embassy requires and coordinates with the employer in Germany. You have translations and apostilles done and apply to the embassy yourself; the appointment and the decision come from the embassy." },
  { model: "GuidePage", old: "Наш офис в Баку помогает семьям составить список документов, организовать переводы и апостиль, подготовиться к записи в посольство и согласовать сроки с работодателем в Германии.", new: "Наш офис в Баку составляет для семей список документов, готовит полный пакет, который требует посольство, и согласует сроки с работодателем в Германии. Переводы, апостиль и подачу заявления в посольство вы оформляете сами; дату приёма и решение сообщает посольство." },
  { model: "GuidePage", old: "Ekibimiz ailelere belge listesinin hazırlanması, tercüme ve apostil, randevu hazırlığı ve Almanya’daki işverenle koordinasyon konularında destek verir.", new: "Ekibimiz aileler için belge listesini ve büyükelçiliğin istediği belge setini hazırlar, Almanya’daki işverenle koordinasyonu sağlar. Tercüme, apostil ve büyükelçiliğe başvuruyu kendiniz yaparsınız; randevuyu ve kararı büyükelçilik bildirir." },
  { model: "GuidePage", old: "Наша команда допомагає родинам скласти перелік документів, організувати переклади й апостиль, підготуватися до запису в представництво та узгодити строки з роботодавцем у Німеччині.", new: "Наша команда складає для родин перелік документів, готує повний пакет, якого вимагає представництво, і узгоджує строки з роботодавцем у Німеччині. Переклади, апостиль і подання заяви до представництва ви оформлюєте самі; дату прийому й рішення повідомляє представництво." },
  // seed/guideDrafts/az.ts
  { model: "GuidePage", old: "**apostil** və təsdiqlənmiş tərcümə lazımdır. Sənədlərin yoxlanması", new: "**apostil** və təsdiqlənmiş tərcümə lazımdır; apostil və tərcüməni özünüz etdirirsiniz. Sənədlərin yoxlanması" },
  // seed/guideDrafts/en.ts
  { model: "GuidePage", old: "need an **apostille and a certified translation**. Our [document service]", new: "need an **apostille and a certified translation**, which you have done yourself. Our [document service]" },
  // seed/guideDrafts/tr.ts
  { model: "GuidePage", old: "**apostil ve onaylı tercüme** gerekir. [Belge hizmetimiz]", new: "**apostil ve onaylı tercüme** gerekir; bunları kendiniz yaptırırsınız. [Belge hizmetimiz]" },
  // seed/guideDrafts/uk.ts
  { model: "GuidePage", old: "потрібні **апостиль і засвідчений переклад**. Наш [сервіс", new: "потрібні **апостиль і засвідчений переклад** — їх ви оформлюєте самостійно. Наш [сервіс" },
  // seed/guideDrafts/ru.ts
  { model: "GuidePage", old: "нужен **апостиль** и заверенный перевод. Помощь с подготовкой", new: "нужен **апостиль** и заверенный перевод — их вы оформляете самостоятельно. Помощь с подготовкой" },
  // seed/guideDrafts/de.ts
  { model: "GuidePage", old: "begleitet Übersetzungen, Anerkennungsantrag und Visum", new: "begleitet Anerkennungsantrag und Visum" },
  { model: "GuidePage", old: "Wir bereiten die Unterlagen Ihrer künftigen Mitarbeitenden aus Aserbaidschan vollständig vor, koordinieren Übersetzungen und begleiten den Visumtermin in Baku.", new: "Wir stellen für Ihre künftigen Mitarbeitenden aus Aserbaidschan die vollständigen Unterlagen zusammen, die die Botschaft verlangt; den Visumantrag stellen die Fachkräfte selbst bei der Botschaft in Baku, die auch den Termin vergibt." },
  // seed/guideDrafts/en.ts
  { model: "GuidePage", old: "- support **recognition and visa** applications and coordinate with the embassy,", new: "- support **recognition and visa** applications and prepare the complete set of documents the embassy requires (candidates apply to the embassy themselves)," },
  // seed/guideDrafts/professions/architekt.ts
  { model: "GuidePage", old: "организуем переводы и подаём визовые документы через посольство в Баку.", new: "готовим и передаём вам полный пакет документов для посольства в Баку; заявление вы подаёте сами, переводы тоже оформляете самостоятельно." },
  { model: "GuidePage", old: "tərcümələri təşkil edirik və viza sənədlərini Bakıdakı səfirliyə təqdim edirik.", new: "Bakıdakı səfirliyin tələb etdiyi tam viza sənəd paketini hazırlayıb sizə veririk; müraciəti və tərcümələri özünüz edirsiniz." },
  { model: "GuidePage", old: "organisieren Übersetzungen und den Visumantrag bei der Botschaft in Baku.", new: "stellen Ihnen die vollständigen Visumunterlagen für die Botschaft in Baku zusammen; den Antrag stellen Sie selbst, Übersetzungen lassen Sie selbst anfertigen." },
  { model: "GuidePage", old: "arrange translations and file your visa application at the embassy in Baku.", new: "prepare the complete set of visa documents the embassy in Baku requires; you apply there yourself and have the translations done yourself." },
  // seed/guideDrafts/professions/arzt.ts
  { model: "GuidePage", old: "собрать документы, организовать переводы и апостиль, найти", new: "собрать документы (переводы и апостиль вы оформляете самостоятельно), найти" },
  { model: "GuidePage", old: "sənədləri toplamağa, tərcümə və apostili təşkil etməyə, alman", new: "sənədləri toplamağa (tərcümə və apostili özünüz etdirirsiniz), alman" },
  { model: "GuidePage", old: "beim Zusammenstellen der Unterlagen, bei Übersetzungen und Apostille, bei Sprachkursen", new: "beim Zusammenstellen der Unterlagen (Übersetzungen und Apostille lassen Sie selbst anfertigen), bei Sprachkursen" },
  { model: "GuidePage", old: "assemble your documents, organise translations and apostilles, find", new: "assemble your documents (you have translations and apostilles done yourself), find" },
  // seed/guideDrafts/professions/zahnarzt.ts
  { model: "GuidePage", old: "подготовить документы, переводы и апостиль, найти", new: "подготовить документы (переводы и апостиль вы оформляете самостоятельно), найти" },
  { model: "GuidePage", old: "sənədləri, tərcümə və apostili hazırlamağa, alman", new: "sənədləri hazırlamağa (tərcümə və apostili özünüz etdirirsiniz), alman" },
  { model: "GuidePage", old: "bei Unterlagen, Übersetzungen und Apostille, bei Sprachkursen", new: "bei Unterlagen (Übersetzungen und Apostille lassen Sie selbst anfertigen), bei Sprachkursen" },
  { model: "GuidePage", old: "prepare documents, translations and apostilles, and find", new: "prepare documents (you have translations and apostilles done yourself), and find" },
  // seed/guideDrafts/professions/buchhalter.ts
  { model: "GuidePage", old: "организуем переводы и подачу, а затем", new: "готовим заявление (переводы вы оформляете самостоятельно), а затем" },
  { model: "GuidePage", old: "tərcümə və müraciəti təşkil edir, sonra", new: "müraciəti hazırlayır (tərcüməni özünüz etdirirsiniz), sonra" },
  { model: "GuidePage", old: "organisieren Übersetzungen und Antrag und planen", new: "bereiten den Antrag vor (Übersetzungen lassen Sie selbst anfertigen) und planen" },
  { model: "GuidePage", old: "organise translations and the application, and plan", new: "prepare the application (you have the translations done yourself), and plan" },
  // seed/guideDrafts/professions/elektroniker.ts
  { model: "GuidePage", old: "организуем переводы и подачу, подбираем", new: "готовим заявление (переводы вы оформляете самостоятельно), подбираем" },
  { model: "GuidePage", old: "tərcümələri və müraciəti təşkil edirik, işəgötürən", new: "müraciəti hazırlayırıq (tərcümələri özünüz etdirirsiniz), işəgötürən" },
  { model: "GuidePage", old: "organisieren Übersetzungen und Antrag, vermitteln", new: "bereiten den Antrag vor (Übersetzungen lassen Sie selbst anfertigen), vermitteln" },
  { model: "GuidePage", old: "organise translations and the application, find", new: "prepare the application (you have the translations done yourself), find" },
  // seed/guideDrafts/professions/ingenieur.ts
  { model: "GuidePage", old: "организуем переводы и подачу в посольство в Баку.", new: "готовим и передаём вам полный пакет документов для посольства в Баку; заявление вы подаёте сами, переводы тоже оформляете самостоятельно." },
  { model: "GuidePage", old: "tərcümələri və Bakıdakı səfirliyə müraciəti təşkil edirik.", new: "Bakıdakı səfirliyin tələb etdiyi tam sənəd paketini hazırlayıb sizə veririk; müraciəti və tərcümələri özünüz edirsiniz." },
  { model: "GuidePage", old: "und organisieren Übersetzungen und den Visumantrag in Baku.", new: "und stellen Ihnen die vollständigen Visumunterlagen für die Botschaft in Baku zusammen; den Antrag stellen Sie selbst, Übersetzungen lassen Sie selbst anfertigen." },
  { model: "GuidePage", old: "and arrange translations and your visa application in Baku.", new: "and prepare the complete set of visa documents the embassy in Baku requires; you apply there yourself and have the translations done yourself." },
  // seed/guideDrafts/professions/koch.ts
  { model: "GuidePage", old: "организуем переводы и подачу в IHK FOSA, а затем", new: "готовим заявление в IHK FOSA (переводы вы оформляете самостоятельно), а затем" },
  { model: "GuidePage", old: "tərcümələri və IHK FOSA-ya müraciəti təşkil edirik, sonra", new: "IHK FOSA-ya müraciəti hazırlayırıq (tərcümələri özünüz etdirirsiniz), sonra" },
  { model: "GuidePage", old: "organisieren Übersetzungen und den Antrag bei der IHK FOSA, vermitteln", new: "bereiten den Antrag bei der IHK FOSA vor (Übersetzungen lassen Sie selbst anfertigen), vermitteln" },
  { model: "GuidePage", old: "organise translations and the IHK FOSA application, find", new: "prepare the IHK FOSA application (you have the translations done yourself), find" },
  // src/lib/automation/examples.ts (example rule "contract-signed-embassy-task", created once in one language)
  { model: "AutomationRule", where: "contract-signed-embassy-task", old: "Müqavilə imzalandı → səfirlik görüşü tapşırığı", new: "Müqavilə imzalandı → səfirlik sənəd paketi tapşırığı", group: "automation-rule-name" },
  { model: "AutomationRule", where: "contract-signed-embassy-task", old: "Vertrag unterschrieben → Aufgabe Botschaftstermin", new: "Vertrag unterschrieben → Aufgabe Botschaftsunterlagen", group: "automation-rule-name" },
  { model: "AutomationRule", where: "contract-signed-embassy-task", old: "Contract signed → embassy appointment task", new: "Contract signed → embassy document set task", group: "automation-rule-name" },
  { model: "AutomationRule", where: "contract-signed-embassy-task", old: "Договор подписан → задача «запись в посольство»", new: "Договор подписан → задача «пакет документов для посольства»", group: "automation-rule-name" },
  { model: "AutomationRule", where: "contract-signed-embassy-task", old: "{{case.number}}: {{client.fullName}} üçün səfirlik görüşü təyin edin", new: "{{case.number}}: {{client.fullName}} üçün səfirlik sənəd paketini hazırlayın", group: "automation-task-title" },
  { model: "AutomationRule", where: "contract-signed-embassy-task", old: "{{case.number}}: Botschaftstermin für {{client.fullName}} buchen", new: "{{case.number}}: Botschaftsunterlagen für {{client.fullName}} zusammenstellen", group: "automation-task-title" },
  { model: "AutomationRule", where: "contract-signed-embassy-task", old: "{{case.number}}: book the embassy appointment for {{client.fullName}}", new: "{{case.number}}: prepare the embassy document set for {{client.fullName}}", group: "automation-task-title" },
  { model: "AutomationRule", where: "contract-signed-embassy-task", old: "{{case.number}}: записать {{client.fullName}} в посольство", new: "{{case.number}}: подготовить пакет документов для посольства для {{client.fullName}}", group: "automation-task-title" },
  // src/lib/training/starter.ts (TrainingLesson.body of the starter course)
  { model: "TrainingLesson", old: "6. **Görüş təyin edildi** — səfirlik görüşünün tarixi və yeri qeyd olunur.", new: "6. **Görüş təyin edildi** — səfirliyin müştəriyə verdiyi görüşün tarixi və yeri qeyd olunur. Görüşü biz götürmürük: səfirliyin tələb etdiyi sənəd paketini hazırlayıb müştəriyə veririk, müraciəti səfirliyə müştəri özü edir." },
  // src/lib/quotes/settings.ts (Setting "quotes", saved once an admin edits the Angebote catalogue)
  { model: "Setting", where: "quotes", old: "Visa- und Behördenservice (Antrag, Termin, Begleitung)", new: "Visa- und Behördenservice (vollständige Botschaftsunterlagen, Begleitung)" },
];

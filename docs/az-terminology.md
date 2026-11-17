# Azerbaijani UI terminology and plain-language guide

Who reads our Azerbaijani texts: workers and their families. Many have no university education and read
on a phone. Staff read the admin texts. Write so that both groups understand them the first time.

The test `client/src/i18n/azTerminology.test.ts` checks the client-facing `az` strings (all i18n modules
except staff/admin ones, plus the page-help texts) for the banned variants below. If a variant is really
needed (for example an external "portal"), add the key path to its `ALLOW` list with a short reason.

## 1. One term per concept

| Concept | Use (az) | Do not use | Notes |
| --- | --- | --- | --- |
| Case / application of a client | **müraciət** (müraciətiniz, Müraciətim) | iş, keys, dosye, "case" | Also in staff screens ("Müraciəti aç", "Müraciətlər"). |
| The client's logged-in area | **kabinet** (Kabinetim, kabinetinizdə) | portal, şəxsi hesab | "portal" only for external sites: Auslandsportal, ELSTER, e-gov.az, job/property portals, and the employer/partner portal. |
| User account (login) | **hesab** | — | Never use "hesab" alone for an invoice. |
| Password | **şifrə** | parol | "Şifrəni göstər", "Şifrəni sıfırla". |
| E-mail | **e-poçt** | email, e-mail, mail | Placeholders like `{{email}}` stay. |
| Upload | **yükləmək** (Yüklə, yükləyin) | aplod | |
| Download | **endirmək** (Endir, PDF endir) | "yüklə" for downloading | "yüklə" means upload in our UI. |
| Press a button / link | **basın** (düyməsinə basın, linkə basın) | klikləyin, kliklədikdə | "toxunun" only for touching a picture, map or card. "bir kliklə" (with one click) is fine. |
| Document | **sənəd**; list of required documents: **sənəd siyahısı** | çeklist | |
| Employer | **işəgötürən** | işverən, iş verən | |
| Worker / candidate | **işçi** (employed), **namizəd** (in selection) | kandidat | |
| Client | **müştəri** | klient | |
| Staff member | **əməkdaş**; the client's contact person: **meneceriniz** | personal, işçi heyəti | |
| Embassy | **səfirlik** (Bakıdakı Almaniya səfirliyi) | konsulluq (unless it really is a consulate) | We prepare documents; the client applies; the embassy decides. We do not book embassy appointments. |
| Appointment | **görüş** (səfirlik görüşü, Bürgeramt görüşü, görüş vaxtı) | randevu, termin | German "Termin" may appear once in brackets: "görüş vaxtı (Termin)". |
| Free consultation | **məsləhət** (Pulsuz məsləhət, Məsləhətə yazılın, məsləhət görüşü) | konsultasiya | "hüquqi məsləhət deyil" = not legal advice. |
| Residence permit | **yaşayış icazəsi** (Aufenthaltstitel); the card: **yaşayış kartı (eAT)** | iqamə, yaşama icazəsi | |
| Visa approved | **viza təsdiqləndi / vizanız təsdiqlənib** | — | |
| Invoice | **hesab-faktura** | faktura, invoys, hesab (alone) | "hesab nömrəsi" is a bank account number; write "hesab-faktura nömrəsi". |
| Payment | **ödəniş** (Ödənişlər) | | |
| Notification | **bildiriş** | notifikasiya | "xəbərdarlıq" means warning. |
| Settings | **parametrlər** (Bildiriş parametrləri) | ayarlar, tənzimləmələr | |
| Dashboard / home | **İcmal** (staff), **Əsas** (client) | dashboard, daşbord | |
| Task | **tapşırıq** | task, vəzifə | |
| Deadline | **son tarix** | dedlayn, deadline | |
| Message / chat | **mesaj**; the chat feature: **çat** (Menecerlə çat) | söhbət (for the chat feature) | "söhbət" is fine for a phone call or the AI assistant conversation. |
| Status | **status** | | |
| Certificate | **sertifikat** (language, course); **şəhadətnamə** (birth, marriage) | | |
| Diploma recognition | **diplomun tanınması (Anerkennung)** | | |
| Address registration | **Anmeldung (ünvan qeydiyyatı)** | | |
| Tax ID | **Steuer-ID (vergi nömrəsi)** | | |
| Registration certificate | **Meldebescheinigung (qeydiyyat arayışı)** | | |
| Immigration office | **Ausländerbehörde (miqrasiya idarəsi)** | | |
| Citizens' office | **Bürgeramt (vətəndaş xidməti)** | | |
| VIDEX | **VIDEX (səfirliyin onlayn viza anketi)** | | |

## 2. Address and tone

- Always the polite **Siz** form, also in staff screens: "Yükləyin", "Sizə göndərilib".
  Exceptions (deliberately informal): the "Which German city suits you?" quiz, the shareable "visa story"
  cards and the referral message a client sends to a friend.
- Buttons: a verb in the short form, at most 3 words, capital first letter only: "Yadda saxla", "PDF endir",
  "Məsləhətə yazıl".
- Headings: capital first letter only ("Sənəd siyahısı", not "Sənəd Siyahısı").

## 3. Plain language

- One idea per sentence; at most about 20 words. Split long sentences with a full stop instead of ";" or "—".
- Say what the person should do and why: "Pasportun şəklini yükləyin. Səfirlik onu tələb edir."
- Use everyday words: "lazımdır" instead of "tələb olunur" where possible; "sonra" instead of "müvafiq olaraq".
- German words that people must recognise (Anmeldung, Steuer-ID, Bürgeramt, Meldebescheinigung,
  Ausländerbehörde, Krankenkasse, Kaution …) stay in German, with a short Azerbaijani gloss in brackets the
  first time they appear on a screen.
- Numbers, amounts, dates, legal references (§ …) and placeholders (`{{name}}`, `${p.date}`) never change
  when a sentence is rewritten.
- Legal texts (privacy policy, terms, imprint) keep their reviewed wording; only fix spelling there.

## 4. Spelling

- Azerbaijani letters: ə, ı, i/İ, ş, ç, ğ, ö, ü. The capital of **i** is **İ** (İsti, İmza), the capital of
  **ı** is **I**. German names keep German spelling: Goethe-Institut, Impressum.
- Suffixes after German or foreign words take a hyphen: Steuer-ID-ni, Finanzamt-a, Goethe-Institut-un.
- Units and numbers: "15 €", "3,6 %", "10 dəqiqə".

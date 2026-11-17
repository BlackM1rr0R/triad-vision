/**
 * Azerbaijani terminology guard (see docs/az-terminology.md).
 *
 * Walks every client-facing `az` string of the i18n modules and the page-help texts and fails when a
 * banned variant of a key term appears. Staff/admin modules and the legal texts (privacy policy) are
 * out of scope; a variant that is genuinely needed goes into ALLOW with the key path and a reason.
 */
import { describe, expect, it } from 'vitest';
import { HELP_AZ } from '@/lib/pageHelp/texts/az';

type Tree = string | number | boolean | null | undefined | Tree[] | { [k: string]: Tree };

// Every i18n module except the runtime entry (index.ts) and the locale-only files of other languages.
const MODULES = import.meta.glob<Record<string, unknown>>(['./*.ts', '!./index.ts', '!./*.test.ts', '!./de.ts', '!./en.ts', '!./ru.ts'], { eager: true });

/** Staff / admin / internal tools: not client-facing (kept consistent by review, not by this test). */
const STAFF_FILE =
  /\/(admin|adminNav|adminSimple|designSystem|commandPalette|workspace|vacancyFolders|pages(Admin\w*|Staff\w*|Ops|Automation|Accounting|Mail|MailAdmin|Team|Reports|SalesAnalytics|BizAnalytics|Campaigns|Marketing|DataFreshness|Seo|SeoAdmin|SearchConsole|Whitelabel|Workspace|Drive\w*|Duplicates|Inquiries|JobFeeds|PublicApiAdmin|AiMgmt|AiStaff|AiAdmin|Ai|AiCase|AiWriting|AiMail|Agents|PartnerRecords|Partners|Settlement\w*|Sheet|TvDisplay|Calls|CasesList|CaseProcessing|DocsIntel|DocCreate|ExternalApps|Overview|Today|Tasks|Growth|GrowthPlus|Quotes|Sign|Translations|StudyAdmin|DiscoverAdmin|GoogleReview|PrivacyTools|TimeCare|EmployerChecklistAdmin|CourseAdmin|GermanyJobsAdmin|Contracts|Onboarding|Platform|Configurator|Developers|Embeds|PublicReports|Authorities|Finance|History|LiveChatPlus|RealSalaries|LegalPolicy|A11yStatement|EmployerPipeline|EmployerWorkers|CandidateCatalogue|StaffDesk))\.ts$/;
/** Staff sub-trees inside otherwise client-facing modules. */
const STAFF_KEY = /(^|\.)(admin\w*|staff\w*|ops|sp|ux|wprof|refPartners)(\.|$)/;

interface Rule {
  term: string;
  banned: RegExp;
  use: string;
}
const L = '\\p{L}';
const RULES: Rule[] = [
  { term: 'password', banned: new RegExp(`(?<![${L}-])[Pp]arol`, 'u'), use: 'şifrə' },
  { term: 'consultation', banned: /[Kk]onsultasiya/u, use: 'məsləhət (məsləhətə yazılın)' },
  { term: 'invoice', banned: new RegExp(`(?<![${L}-])[Ff]aktura`, 'u'), use: 'hesab-faktura' },
  { term: 'invoice', banned: /invoys|invoice/iu, use: 'hesab-faktura' },
  { term: 'press (click)', banned: /[Kk]likləy|[Kk]liklədik|[Kk]liklən/u, use: 'basın' },
  { term: 'settings', banned: new RegExp(`(?<![${L}])[Aa]yar(lar|ı|ları|lara|larda|larını|ların)?(?![${L}])`, 'u'), use: 'parametrlər' },
  { term: 'employer', banned: new RegExp(`(?<![${L}])(iş ?verən|işverən)`, 'iu'), use: 'işəgötürən' },
  { term: 'e-mail', banned: new RegExp(`(?<![${L}{.-])e-?mail(?![${L}}])`, 'iu'), use: 'e-poçt' },
  { term: 'case', banned: new RegExp(`(?<![${L}])(keys|dosye|case)(?![${L}])`, 'iu'), use: 'müraciət' },
  { term: 'deadline', banned: /dedlayn|deadline/iu, use: 'son tarix' },
  { term: 'residence permit', banned: new RegExp(`(?<![${L}])[Iİi]qamə(?![${L}]*gah)`, 'u'), use: 'yaşayış icazəsi' },
  { term: 'appointment', banned: new RegExp(`(?<![${L}])randevu`, 'iu'), use: 'görüş' },
  { term: 'own area', banned: new RegExp(`(?<![${L}-])[Pp]ortal(ı|ın|a|da|dan|dakı)?(?![${L}])`, 'u'), use: 'kabinet' },
  { term: 'formal address', banned: new RegExp(`(?<![${L}])(sən|sənin|səni|sənə|səndən)(?![${L}])`, 'iu'), use: 'Siz' },
  { term: 'Goethe-Institut', banned: /İnstitut/u, use: 'Goethe-Institut (German spelling)' },
  // An Azerbaijani word never starts with the Latin capital I: it is İ (e.g. "İsti", not "Isti").
  { term: 'dotted İ', banned: new RegExp(`(?<![${L}])I[a-z]*[əğışçöü]`, 'u'), use: 'İ' },
];
/** download buttons say "Endir" (yüklə = upload). */
const DOWNLOAD_KEY = /(^|\.)download\w*$/i;

/** Legitimate uses: key path prefix → reason. */
const ALLOW: Record<string, string> = {
  // external websites are "portal"
  'az.housing.steps.search.points': 'property portals (ImmoScout24 …)',
  'az.aptView.scams.items.5': 'report the advert to the listing portal',
  'az.pdfTools.compress.portal': 'upload limits of official online portals',
  'az.rentCheck.dataNote': 'listing portals as a data source',
  'az.visaChecklist': 'Auslandsportal (the embassy portal)',
  'az.visaRefusal': 'Auslandsportal',
  'az.taxRefund.howTo.s2': 'ELSTER portal',
  'az.anerkPage': 'the federal "Anerkennung in Deutschland" portal',
  'az.ega': 'e-gov.az portal (employer guide)',
  'az.catalogue.request': 'the employer portal (for employers)',
  'az.employerReports': 'the employer portal (for employers)',
  'az.avv.company.unavailable': 'the employer portal (for employers)',
  'az.partnerPortal': 'the partner portal (for partners)',
  'az.officialForms': 'the employer portal (for employers)',
  'az.trust.docs': 'the employer portal (for employers)',
  'az.partnerHub': 'the partner portal (staff set up partners)',
  'az.accel.messages.channel.PORTAL': "an authority's online portal",
  'az.legalPages.privacy': 'legal text (privacy notice): wording kept as reviewed',
  // informal voice on purpose: playful quiz and the shareable "visa story" (Triad Wrapped)
  'az.whichCity': 'playful quiz, deliberately informal',
  'az.toolsPage.items.whichCity': 'title of the playful quiz',
  'az.vstory': 'shareable story cards, deliberately informal',
  // Latin capital I in a non-Azerbaijani word
  'az.legalPages.impressum': 'German "Impressum"',
};
const allowed = (key: string) => Object.keys(ALLOW).some((p) => key === p || key.startsWith(p + '.'));

function walk(node: Tree, path: string, out: Array<[string, string]>) {
  if (typeof node === 'string') out.push([path, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}.${i}`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, out);
}

function clientStrings(): Array<[string, string, string]> {
  const rows: Array<[string, string, string]> = [];
  for (const [file, mod] of Object.entries(MODULES)) {
    if (STAFF_FILE.test(file)) continue;
    for (const exp of Object.values(mod)) {
      if (!exp || typeof exp !== 'object' || !('az' in exp)) continue;
      const out: Array<[string, string]> = [];
      walk((exp as { az: Tree }).az, 'az', out);
      for (const [k, v] of out) if (!STAFF_KEY.test(k)) rows.push([file, k, v]);
    }
  }
  const help: Array<[string, string]> = [];
  walk(HELP_AZ as unknown as Tree, 'HELP_AZ', help);
  for (const [k, v] of help) rows.push(['pageHelp/texts/az.ts', k, v]);
  return rows;
}

describe('Azerbaijani terminology (client-facing)', () => {
  const rows = clientStrings();

  it('finds the client copy', () => {
    expect(rows.length).toBeGreaterThan(5000);
  });

  it('uses the one preferred term for each key concept', () => {
    const problems: string[] = [];
    for (const [file, key, raw] of rows) {
      if (allowed(key)) continue;
      const text = raw.replace(/\{\{[^}]*\}\}/g, ' '); // placeholders such as {{email}}
      for (const r of RULES) {
        const m = text.match(r.banned);
        if (m) problems.push(`${file} ${key}: "${m[0]}" → use "${r.use}" (${r.term})`);
      }
      if (DOWNLOAD_KEY.test(key) && /yüklə/iu.test(text)) problems.push(`${file} ${key}: download button says "yüklə" → use "Endir"`);
    }
    expect(problems).toEqual([]);
  });
});

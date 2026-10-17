import { buildXlsxBook, type Cell } from '../xlsx.js';
import { asOfFor, byType, commissionsByAgent, monthly, receivables, staffStats, summarize } from './aggregate.js';
import { loadAgents, loadCategories, loadDocsReviewed, loadFinanceData, loadSatisfaction, loadStaff } from './load.js';
import { isoDay, type Period } from './period.js';

/** Report sections as served by the API (amounts in cents). */
export const summaryReport = async (p: Period, now = new Date()) => summarize(await loadFinanceData(p), p, now);

export const monthlyReport = async (p: Period, now = new Date()) => monthly(await loadFinanceData(p), p, now);

export const receivablesReport = async (p: Period, now = new Date()) => {
  const d = await loadFinanceData(p);
  return receivables(d.invoices, asOfFor(p, now));
};

export const commissionsReport = async (p: Period) => {
  const d = await loadFinanceData(p);
  return commissionsByAgent(await loadAgents(p), d.commissions, p);
};

export const staffReport = async (p: Period) => {
  const [d, staff, docs, sat] = await Promise.all([loadFinanceData(p), loadStaff(), loadDocsReviewed(p), loadSatisfaction(p)]);
  return staffStats(staff, d.cases, docs, sat, p);
};

export const byTypeReport = async (p: Period) => {
  const [d, categories] = await Promise.all([loadFinanceData(p), loadCategories()]);
  const r = byType(d, p);
  const cat = new Map(categories.map((c) => [c.id, c]));
  return {
    byVisaType: r.byVisaType,
    byCategory: r.byCategory.map((row) => {
      const c = row.key ? cat.get(row.key) : undefined;
      return { ...row, slug: c?.slug ?? null, visaLabel: c?.visaLabel ?? null, title: (c?.title as Record<string, string> | undefined) ?? null };
    }),
  };
};

// ─── Excel workbook ─────────────────────────────────────────────────────

const eur = (cents: number | null | undefined) => (cents == null ? null : Math.round(cents) / 100);

/** Visa type names in the office language (Azerbaijani). */
const VISA_TYPE_AZ: Record<string, string> = {
  WORK: 'İş vizası',
  AUSBILDUNG: 'Ausbildung',
  WEITERBILDUNG: 'Weiterbildung',
  JOB_SEEKER: 'İş axtarışı (Chancenkarte)',
  STUDY: 'Təhsil vizası',
  FAMILY: 'Ailə birləşməsi',
  TOURIST: 'Turist vizası',
};
const ROLE_AZ: Record<string, string> = { STAFF: 'Əməkdaş', ADMIN: 'Admin', SUPER_ADMIN: 'Super admin' };
const STATUS_AZ: Record<string, string> = { SENT: 'Göndərilib', OVERDUE: 'Gecikir', PAID: 'Ödənilib' };
const NONE = '— (təyin edilməyib)';

export const financeWorkbook = async (p: Period, now = new Date()) => {
  const [d, agents, staff, docs, sat, categories] = await Promise.all([
    loadFinanceData(p),
    loadAgents(p),
    loadStaff(),
    loadDocsReviewed(p),
    loadSatisfaction(p),
    loadCategories(),
  ]);
  const s = summarize(d, p, now);
  const months = monthly(d, p, now);
  const rec = receivables(d.invoices, asOfFor(p, now));
  const com = commissionsByAgent(agents, d.commissions, p);
  const st = staffStats(staff, d.cases, docs, sat, p);
  const bt = byType(d, p);
  const cat = new Map(categories.map((c) => [c.id, c]));
  const catName = (id: string | null) => {
    if (!id) return NONE;
    const c = cat.get(id);
    if (!c) return id;
    const title = (c.title as Record<string, string> | null)?.az ?? c.slug;
    return c.visaLabel ? `${title} (${c.visaLabel})` : title;
  };

  const summaryRows: Cell[][] = [
    ['Dövr (başlanğıc)', p.from],
    ['Dövr (son)', p.to],
    ['Gəlir — ödənilmiş hesablar (brutto), EUR', eur(s.revenue.grossCents)],
    ['Gəlir — ödənilmiş hesablar (netto), EUR', eur(s.revenue.netCents)],
    ['Ödənilmiş hesabların sayı', s.revenue.count],
    ['Açıq debitor borcu (brutto), EUR', eur(s.receivables.grossCents)],
    ['Açıq hesabların sayı', s.receivables.count],
    ['O cümlədən gecikmiş, EUR', eur(s.receivables.overdueGrossCents)],
    ['Gecikmiş hesabların sayı', s.receivables.overdueCount],
    ['Tərcümə gəliri, EUR', eur(s.translation.cents)],
    ['Təhvil verilmiş tərcümə sifarişləri', s.translation.count],
    ['Agent komissiyaları — gözləyən, EUR', eur(s.commissions.pendingCents)],
    ['Agent komissiyaları — təsdiqlənmiş (ödənilməmiş), EUR', eur(s.commissions.approvedCents)],
    ['Agent komissiyaları — ödənilmiş, EUR', eur(s.commissions.paidCents)],
    ['Təxmini nəticə (netto gəlir + tərcümə − ödənilmiş komissiya), EUR', eur(s.netResultCents)],
    ['Yeni müraciətlər', s.cases.new],
    ['Təsdiqlənmiş vizalar', s.cases.approved],
    ['İmtina', s.cases.rejected],
    ['Konversiya (təsdiq / qərar), %', s.cases.conversionPct],
    ['Qərara qədər orta müddət, gün', s.cases.avgDaysToDecision],
    ['Debitor borcu tarixinə', isoDay(rec.asOf)],
  ];

  const book = buildXlsxBook([
    { name: 'Xülasə', headers: ['Göstərici', 'Dəyər'], rows: summaryRows, widths: [62, 18] },
    {
      name: 'Aylar',
      headers: ['Ay', 'Hesab kəsilib, EUR', 'Ödənilib, EUR', 'Ay sonuna açıq borc, EUR', 'Tərcümə gəliri, EUR', 'Ödənilmiş komissiya, EUR', 'Yeni müraciətlər', 'Təsdiqlənmiş vizalar'],
      rows: months.map((m) => [m.month, eur(m.invoicedCents), eur(m.paidCents), eur(m.outstandingCents), eur(m.translationCents), eur(m.commissionsPaidCents), m.newCases, m.approved]),
    },
    {
      name: 'Debitor borcları',
      headers: ['Hesab №', 'Şirkət', 'Tarix', 'Ödəniş tarixi', 'Status', 'Gecikmə, gün', 'Qrup', 'Məbləğ (brutto), EUR'],
      rows: [
        ...rec.rows.map((r) => [r.number, r.companyName, isoDay(r.issueDate), isoDay(r.dueDate), STATUS_AZ[r.status] ?? r.status, r.daysOverdue, r.bucket, eur(r.grossCents)]),
        ...rec.aging.map((a) => [`Qrup ${a.bucket} gün`, '', '', '', '', null, a.bucket, eur(a.grossCents)]),
        ['Cəmi', '', '', '', '', null, '', eur(rec.totalGrossCents)],
      ],
    },
    {
      name: 'Komissiyalar',
      headers: ['Agent', 'Kod', 'Region', 'Yeni referallar', 'Bütün referallar', 'Gözləyən, EUR', 'Təsdiqlənmiş, EUR', 'Ödənilmiş, EUR', 'Ləğv edilmiş, EUR', 'Cəmi, EUR'],
      rows: [
        ...com.rows.map((r) => [r.name, r.code, r.region ?? '', r.referralsInRange, r.referralsTotal, eur(r.pendingCents), eur(r.approvedCents), eur(r.paidCents), eur(r.cancelledCents), eur(r.totalCents)]),
        ['Cəmi', '', '', com.totals.referralsInRange, null, eur(com.totals.pendingCents), eur(com.totals.approvedCents), eur(com.totals.paidCents), eur(com.totals.cancelledCents), eur(com.totals.totalCents)],
      ],
    },
    {
      name: 'Əməkdaşlar',
      headers: ['Əməkdaş', 'Rol', 'Aktiv müraciətlər', 'Yeni müraciətlər', 'Təsdiq', 'İmtina', 'Təsdiq faizi, %', 'Qərara qədər orta gün', 'Yoxlanılmış sənədlər', 'Məmnuniyyət (0–10)', 'Sorğu cavabları'],
      rows: st.map((r) => [r.name, ROLE_AZ[r.role] ?? r.role, r.activeCases, r.newCases, r.approved, r.rejected, r.approvalPct, r.avgDaysToDecision, r.documentsReviewed, r.satisfactionAvg, r.satisfactionCount]),
    },
    {
      name: 'Növlər üzrə',
      headers: ['Bölmə', 'Viza növü / kateqoriya', 'Yeni müraciətlər', 'Aktiv', 'Təsdiq', 'İmtina', 'Təsdiq faizi, %', 'Hesab gəliri, EUR', 'Tərcümə gəliri, EUR', 'Gəlir cəmi, EUR', 'Ödənilmiş komissiya, EUR'],
      rows: [
        ...bt.byVisaType.map((r) => ['Viza növü', r.key ? (VISA_TYPE_AZ[r.key] ?? r.key) : NONE, r.newCases, r.active, r.approved, r.rejected, r.approvalPct, eur(r.invoiceRevenueCents), eur(r.translationCents), eur(r.revenueCents), eur(r.commissionsPaidCents)]),
        ...bt.byCategory.map((r) => ['Kateqoriya', catName(r.key), r.newCases, r.active, r.approved, r.rejected, r.approvalPct, eur(r.invoiceRevenueCents), eur(r.translationCents), eur(r.revenueCents), eur(r.commissionsPaidCents)]),
      ],
    },
  ]);
  return { buffer: book, filename: `Finanzbericht-${p.from}-${p.to}.xlsx`, rows: { receivables: rec.rows.length, agents: com.rows.length, staff: st.length } };
};

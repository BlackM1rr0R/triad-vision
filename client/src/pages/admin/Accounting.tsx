import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Coins, Download, Eye, FileArchive, FileSpreadsheet, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/admin/labels';
import {
  acctErrText,
  type AccountKey,
  type AzEntity,
  type CategoryKey,
  type CurrenciesResponse,
  type DatevPreview,
  type DatevSettings,
  type DatevSettingsResponse,
} from '@/components/accounting/api';

type Tab = 'export' | 'datev' | 'currencies';
const TABS: Tab[] = ['export', 'datev', 'currencies'];
const ACCOUNT_KEYS: AccountKey[] = ['revenue19', 'revenue7', 'revenueTaxFree', 'revenueSmallBusiness', 'passThrough', 'bank', 'cash', 'companyInvoices'];
const CATEGORY_KEYS: CategoryKey[] = ['SERVICE_FEE', 'TRANSLATION', 'APOSTILLE', 'COURIER', 'OTHER'];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const lastMonth = () => {
  const now = new Date();
  return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))), to: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))) };
};

const Field = ({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) => (
  <div>
    <label className="label" htmlFor={id}>
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
  </div>
);

/** Admin → Finance → Accounting: DATEV export, DATEV settings, document currencies / billing entities / exchange rates. */
export default function AdminAccounting() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'export';
  const setTab = (v: Tab) => {
    const next = new URLSearchParams(params);
    if (v === 'export') next.delete('tab');
    else next.set('tab', v);
    setParams(next, { replace: true });
  };
  return (
    <div>
      <PageHead title={t('admin.nav.accounting')} subtitle={t('acct.page.subtitle')} />
      <Tabs
        className="mb-5"
        label={t('acct.page.tabs.export')}
        items={TABS.map((v) => ({ key: v, icon: v === 'export' ? FileSpreadsheet : v === 'datev' ? Settings2 : Coins, label: t(`acct.page.tabs.${v}`) }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'export' ? <ExportTab /> : tab === 'datev' ? <DatevTab /> : <CurrenciesTab />}
    </div>
  );
}

// ─── Export ──────────────────────────────────────────────────────────

const ExportTab = () => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(lastMonth);
  const [payments, setPayments] = useState(true);
  const [pdfs, setPdfs] = useState(false);
  const query = (extra: Record<string, string> = {}) => new URLSearchParams({ from: period.from, to: period.to, payments: payments ? '1' : '0', ...extra }).toString();
  const preview = useMutation({
    mutationFn: async () => (await api.get<DatevPreview>(`/admin/accounting/datev/preview?${query()}`)).data,
    onError: (e) => toast.error(acctErrText(e)),
  });
  const p = preview.data;

  return (
    <div className="space-y-5">
      <Panel title={t('acct.export.title')} icon={FileSpreadsheet}>
        <p className="mb-4 text-sm text-muted">{t('acct.export.text')}</p>
        <div className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr] sm:items-end">
          <Field label={t('acct.export.from')} id="dx-from">
            <input id="dx-from" type="date" className="input" value={period.from} onChange={(e) => setPeriod((x) => ({ ...x, from: e.target.value }))} />
          </Field>
          <Field label={t('acct.export.to')} id="dx-to">
            <input id="dx-to" type="date" className="input" min={period.from} value={period.to} onChange={(e) => setPeriod((x) => ({ ...x, to: e.target.value }))} />
          </Field>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Switch checked={payments} onChange={setPayments} label={t('acct.export.payments')} />
            <Switch checked={pdfs} onChange={setPdfs} label={t('acct.export.pdfs')} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" disabled={preview.isPending || !period.from || !period.to} onClick={() => preview.mutate()}>
            {preview.isPending ? <Spinner className="size-3.5" /> : <Eye className="size-3.5" aria-hidden />} {t('acct.export.preview')}
          </button>
          <a className="btn-primary btn-sm" href={`/api/admin/accounting/datev/export?${query(pdfs ? { pdfs: '1' } : {})}`} download>
            {pdfs ? <FileArchive className="size-3.5" aria-hidden /> : <Download className="size-3.5" aria-hidden />} {t('acct.export.download')}
          </a>
        </div>
      </Panel>

      {p && (
        <Panel title={p.fileName} icon={Eye}>
          <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(p.counts) as (keyof DatevPreview['counts'])[]).map((k) => (
              <div key={k} className="rounded-xl bg-sunken px-3 py-2.5">
                <dt className="text-xs text-muted">{t(`acct.export.counts.${k}`)}</dt>
                <dd className="font-display text-lg font-bold text-ink tabular-nums">{p.counts[k]}</dd>
              </div>
            ))}
          </dl>
          {p.warnings.length > 0 && (
            <div className="mb-4 rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="status">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" aria-hidden /> {t('acct.export.warnings')}
              </p>
              <ul className="list-disc pl-5 text-xs">
                {p.warnings.slice(0, 30).map((w) => (
                  <li key={`${w.code}-${w.ref}`}>{t(`acct.export.warning.${w.code}`, { ref: w.ref })}</li>
                ))}
              </ul>
            </div>
          )}
          {p.rows.length === 0 ? (
            <p className="text-sm text-muted">{t('acct.export.empty')}</p>
          ) : (
            <>
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="bg-sunken text-left text-xs text-muted">
                    <tr>
                      {(['date', 'beleg', 'text', 'amount', 'side', 'account', 'contra', 'bu'] as const).map((c) => (
                        <th key={c} className={c === 'amount' ? 'px-3 py-2 text-right font-semibold' : 'px-3 py-2 font-semibold'}>
                          {t(`acct.export.cols.${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {p.rows.map((r, i) => (
                      <tr key={`${r.beleg1}-${i}`}>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                        <td className="px-3 py-2 code-id text-xs whitespace-nowrap">{r.beleg1}</td>
                        <td className="max-w-64 truncate px-3 py-2">{r.text}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {r.amount} {r.currency}
                        </td>
                        <td className="px-3 py-2">{r.side}</td>
                        <td className="px-3 py-2 tabular-nums">{r.account}</td>
                        <td className="px-3 py-2 tabular-nums">{r.contraAccount}</td>
                        <td className="px-3 py-2">{r.buKey}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.total > p.rows.length && <p className="mt-2 text-xs text-muted">{t('acct.export.more', { count: p.rows.length, total: p.total })}</p>}
            </>
          )}
        </Panel>
      )}
    </div>
  );
};

// ─── DATEV settings ──────────────────────────────────────────────────

const DatevTab = () => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'accounting', 'datev'], queryFn: async () => (await api.get<DatevSettingsResponse>('/admin/accounting/datev/settings')).data });
  const [s, setS] = useState<DatevSettings | null>(null);
  useEffect(() => {
    if (q.data) setS(q.data.settings);
  }, [q.data]);
  const save = useMutation({
    mutationFn: async (v: DatevSettings) => (await api.put<DatevSettingsResponse>('/admin/accounting/datev/settings', v)).data,
    onSuccess: (d) => {
      toast.success(t('acct.saved'));
      qc.setQueryData(['admin', 'accounting', 'datev'], d);
    },
    onError: (e) => toast.error(acctErrText(e)),
  });
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  if (!s || !q.data) return <LoadingBlock />;
  const defaults = q.data.chartDefaults[s.chart];
  const set = (patch: Partial<DatevSettings>) => setS((x) => (x ? { ...x, ...patch } : x));
  const num = (v: string) => (v === '' ? 0 : Math.max(0, Math.round(Number(v) || 0)));
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(i18n.language, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 1))));

  return (
    <Panel title={t('acct.datev.title')} icon={Settings2}>
      <p className="mb-4 text-sm text-muted">{t('acct.datev.text')}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('acct.datev.consultant')} id="dv-cons">
          <input id="dv-cons" className="input tabular-nums" inputMode="numeric" value={s.consultantNumber || ''} onChange={(e) => set({ consultantNumber: num(e.target.value) })} />
        </Field>
        <Field label={t('acct.datev.client')} id="dv-client">
          <input id="dv-client" className="input tabular-nums" inputMode="numeric" value={s.clientNumber || ''} onChange={(e) => set({ clientNumber: num(e.target.value) })} />
        </Field>
        <Field label={t('acct.datev.chart')} id="dv-chart">
          <select id="dv-chart" className="input" value={s.chart} onChange={(e) => set({ chart: e.target.value as DatevSettings['chart'] })}>
            <option value="SKR03">SKR03</option>
            <option value="SKR04">SKR04</option>
          </select>
        </Field>
        <Field label={t('acct.datev.fyStart')} id="dv-fy">
          <select id="dv-fy" className="input" value={s.fiscalYearStartMonth} onChange={(e) => set({ fiscalYearStartMonth: Number(e.target.value) })}>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('acct.datev.accountLength')} id="dv-len">
          <input id="dv-len" type="number" min={4} max={8} className="input" value={s.accountLength} onChange={(e) => set({ accountLength: Math.max(4, Math.min(8, num(e.target.value))) })} />
        </Field>
        <Field label={t('acct.datev.dictation')} id="dv-dict">
          <input id="dv-dict" className="input" maxLength={2} value={s.dictationCode} onChange={(e) => set({ dictationCode: e.target.value })} />
        </Field>
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">{t('acct.datev.accountsTitle')}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACCOUNT_KEYS.map((k) => (
          <Field key={k} label={t(`acct.datev.accounts.${k}`)} id={`dv-a-${k}`}>
            <input
              id={`dv-a-${k}`}
              className="input tabular-nums"
              inputMode="numeric"
              placeholder={k === 'companyInvoices' ? '—' : defaults[k]}
              value={s.accounts[k]}
              onChange={(e) => set({ accounts: { ...s.accounts, [k]: e.target.value.replace(/\D/g, '') } })}
            />
          </Field>
        ))}
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">{t('acct.datev.categoryTitle')}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CATEGORY_KEYS.map((k) => (
          <Field key={k} label={t(`bill.category.${k}`, { defaultValue: k })} id={`dv-c-${k}`}>
            <input id={`dv-c-${k}`} className="input tabular-nums" inputMode="numeric" placeholder="—" value={s.categoryAccounts[k]} onChange={(e) => set({ categoryAccounts: { ...s.categoryAccounts, [k]: e.target.value.replace(/\D/g, '') } })} />
          </Field>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_8rem_8rem] sm:items-end">
        <Switch checked={s.useBuKeys} onChange={(v) => set({ useBuKeys: v })} label={t('acct.datev.useBuKeys')} />
        <Field label={t('acct.datev.bu19')} id="dv-bu19">
          <input id="dv-bu19" className="input" maxLength={4} disabled={!s.useBuKeys} value={s.buKeys.vat19} onChange={(e) => set({ buKeys: { ...s.buKeys, vat19: e.target.value } })} />
        </Field>
        <Field label={t('acct.datev.bu7')} id="dv-bu7">
          <input id="dv-bu7" className="input" maxLength={4} disabled={!s.useBuKeys} value={s.buKeys.vat7} onChange={(e) => set({ buKeys: { ...s.buKeys, vat7: e.target.value } })} />
        </Field>
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">{t('acct.datev.debtorTitle')}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('acct.datev.debtorTitle')} id="dv-dm">
          <select id="dv-dm" className="input" value={s.debtorMode} onChange={(e) => set({ debtorMode: e.target.value as DatevSettings['debtorMode'] })}>
            <option value="PER_PARTY">{t('acct.datev.debtorMode.PER_PARTY')}</option>
            <option value="COLLECTIVE">{t('acct.datev.debtorMode.COLLECTIVE')}</option>
          </select>
        </Field>
        {s.debtorMode === 'PER_PARTY' ? (
          <Field label={t('acct.datev.debtorStart')} id="dv-ds">
            <input id="dv-ds" className="input tabular-nums" inputMode="numeric" value={s.debtorStart} onChange={(e) => set({ debtorStart: num(e.target.value) })} />
          </Field>
        ) : (
          <>
            <Field label={t('acct.datev.collectiveClient')} id="dv-cc">
              <input id="dv-cc" className="input tabular-nums" inputMode="numeric" value={s.collectiveClientDebtor} onChange={(e) => set({ collectiveClientDebtor: num(e.target.value) })} />
            </Field>
            <Field label={t('acct.datev.collectiveCompany')} id="dv-ck">
              <input id="dv-ck" className="input tabular-nums" inputMode="numeric" value={s.collectiveCompanyDebtor} onChange={(e) => set({ collectiveCompanyDebtor: num(e.target.value) })} />
            </Field>
          </>
        )}
      </div>
      <div className="mt-4">
        <Switch checked={s.includePayments} onChange={(v) => set({ includePayments: v })} label={t('acct.datev.includePayments')} />
      </div>
      <div className="mt-6 flex justify-end">
        <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate(s)}>
          {save.isPending && <Spinner className="size-3.5" />}
          {t('acct.save')}
        </button>
      </div>
    </Panel>
  );
};

// ─── Currencies, entities, rates ─────────────────────────────────────

const CurrenciesTab = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'accounting', 'currencies'], queryFn: async () => (await api.get<CurrenciesResponse>('/admin/accounting/currencies')).data });
  const [d, setD] = useState<CurrenciesResponse | null>(null);
  useEffect(() => {
    if (q.data) setD(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: async (v: CurrenciesResponse) => (await api.put<CurrenciesResponse>('/admin/accounting/currencies', { entities: v.entities, rates: v.rates })).data,
    onSuccess: (r) => {
      toast.success(t('acct.saved'));
      qc.setQueryData(['admin', 'accounting', 'currencies'], r);
      void qc.invalidateQueries({ queryKey: ['client-billing'] });
    },
    onError: (e) => toast.error(acctErrText(e)),
  });
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  if (!d) return <LoadingBlock />;
  const az = d.entities.az;
  const setAz = (patch: Partial<AzEntity>) => setD((x) => (x ? { ...x, entities: { ...x.entities, az: { ...x.entities.az, ...patch } } } : x));
  const text = (k: keyof AzEntity & string, maxLength = 160) => (
    <Field key={k} label={t(`acct.entities.${k}`)} id={`az-${k}`}>
      <input id={`az-${k}`} className="input" maxLength={maxLength} value={String(az[k] ?? '')} onChange={(e) => setAz({ [k]: e.target.value } as Partial<AzEntity>)} />
    </Field>
  );
  const rate = (c: 'AZN' | 'TRY') => (
    <Field key={c} label={`1 EUR = … ${c}`} id={`rate-${c}`}>
      <input
        id={`rate-${c}`}
        className="input tabular-nums"
        inputMode="decimal"
        value={d.rates.rates[c] ?? ''}
        onChange={(e) => {
          const v = e.target.value.replace(',', '.');
          const n = v === '' ? null : Number(v);
          setD((x) => (x ? { ...x, rates: { ...x.rates, rates: { ...x.rates.rates, [c]: n !== null && Number.isFinite(n) && n > 0 ? n : null } } } : x));
        }}
      />
    </Field>
  );

  return (
    <div className="space-y-5">
      <Panel title={t('acct.entities.title')} icon={Coins}>
        <p className="mb-4 text-sm text-muted">{t('acct.entities.text')}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('acct.entities.defaultCurrency')} id="cur-default">
            <select id="cur-default" className="input" value={d.entities.defaultCurrency} onChange={(e) => setD({ ...d, entities: { ...d.entities, defaultCurrency: e.target.value as CurrenciesResponse['entities']['defaultCurrency'] } })}>
              {d.currencies.map((c) => (
                <option key={c} value={c}>
                  {t(`acct.currency.names.${c}`)}
                </option>
              ))}
            </select>
          </Field>
          {d.currencies.map((c) => (
            <Field key={c} label={`${t('acct.entities.byCurrency')} · ${c}`} id={`ent-${c}`}>
              <select id={`ent-${c}`} className="input" value={d.entities.byCurrency[c]} onChange={(e) => setD({ ...d, entities: { ...d.entities, byCurrency: { ...d.entities.byCurrency, [c]: e.target.value as 'DE' | 'AZ' } } })}>
                <option value="DE">{t('acct.entities.entity.DE')}</option>
                <option value="AZ" disabled={!az.enabled}>
                  {t('acct.entities.entity.AZ')}
                </option>
              </select>
            </Field>
          ))}
        </div>
      </Panel>

      <Panel title={t('acct.entities.azTitle')} icon={Settings2}>
        <Switch checked={az.enabled} onChange={(v) => setAz({ enabled: v })} label={t('acct.entities.azEnabled')} />
        {az.enabled && (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {text('name')}
              {text('street', 200)}
              {text('zipCity')}
              {text('country', 80)}
              {text('taxNumber', 40)}
              {text('vatId', 40)}
              {text('register')}
              {text('managingDirector')}
              {text('email')}
              {text('phone', 60)}
              <Field label={t('acct.entities.vatMode.STANDARD')} id="az-vatmode">
                <select id="az-vatmode" className="input" value={az.vatMode} onChange={(e) => setAz({ vatMode: e.target.value as AzEntity['vatMode'] })}>
                  <option value="STANDARD">{t('acct.entities.vatMode.STANDARD')}</option>
                  <option value="NONE">{t('acct.entities.vatMode.NONE')}</option>
                </select>
              </Field>
              <Field label={t('acct.entities.vatRate')} id="az-vatrate">
                <input id="az-vatrate" type="number" min={0} max={100} className="input" disabled={az.vatMode !== 'STANDARD'} value={az.vatRate} onChange={(e) => setAz({ vatRate: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label={t('acct.entities.exemptionNote')} id="az-exempt">
                <input id="az-exempt" className="input" maxLength={500} value={az.exemptionNote} onChange={(e) => setAz({ exemptionNote: e.target.value })} />
              </Field>
            </div>
            <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">{t('acct.entities.bankTitle')}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(['accountHolder', 'iban', 'bic', 'bank'] as const).map((k) => (
                <Field key={k} label={t(`acct.entities.${k}`)} id={`az-bank-${k}`}>
                  <input id={`az-bank-${k}`} className="input" maxLength={k === 'bic' ? 11 : k === 'iban' ? 42 : 160} value={az.bank[k]} onChange={(e) => setAz({ bank: { ...az.bank, [k]: e.target.value } })} />
                </Field>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel title={t('acct.rates.title')} icon={Coins}>
        <p className="mb-4 text-sm text-muted">{t('acct.rates.text')}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rate('AZN')}
          {rate('TRY')}
          <Field label={t('acct.rates.date')} id="rate-date">
            <input id="rate-date" type="date" className="input" value={d.rates.date ?? ''} onChange={(e) => setD({ ...d, rates: { ...d.rates, date: e.target.value || null } })} />
          </Field>
          <Field label={t('acct.rates.note')} id="rate-note">
            <input id="rate-note" className="input" maxLength={300} value={d.rates.note} onChange={(e) => setD({ ...d, rates: { ...d.rates, note: e.target.value } })} />
          </Field>
        </div>
      </Panel>

      <div className="flex justify-end">
        <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate(d)}>
          {save.isPending && <Spinner className="size-3.5" />}
          {t('acct.save')}
        </button>
      </div>
    </div>
  );
};

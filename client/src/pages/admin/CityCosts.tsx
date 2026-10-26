import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MapPinned, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table } from '@/components/ui/Table';
import { FEDERAL_STATES, STATE_NAMES, type SizeClass } from '@/components/budget/api';
import { registerCopy } from '@/i18n';
import { pagesBudget } from '@/i18n/pagesBudget';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesBudget);

interface Row {
  id: string;
  slug: string;
  name: string;
  kind: 'CITY' | 'GENERIC';
  state: string | null;
  sizeClass: SizeClass;
  aliases: string | null;
  wgMin: number;
  wgMax: number;
  flat1ColdMin: number;
  flat1ColdMax: number;
  flat1UtilMin: number;
  flat1UtilMax: number;
  flat2ColdMin: number;
  flat2ColdMax: number;
  flat2UtilMin: number;
  flat2UtilMax: number;
  companyMin: number;
  companyMax: number;
  foodMin: number;
  foodMax: number;
  transport: number;
  depositMonths: number;
  sourceNote: string | null;
  checkedAt: string;
  active: boolean;
  sortOrder: number;
}
type Draft = Omit<Row, 'id'>;

const PAIRS = ['wg', 'flat1Cold', 'flat1Util', 'flat2Cold', 'flat2Util', 'company', 'food'] as const;
const SIZES: SizeClass[] = ['METRO', 'LARGE', 'MEDIUM', 'SMALL'];
const today = () => new Date().toISOString().slice(0, 10);

const emptyDraft = (): Draft => ({
  slug: '',
  name: '',
  kind: 'CITY',
  state: 'BE',
  sizeClass: 'LARGE',
  aliases: '',
  wgMin: 0,
  wgMax: 0,
  flat1ColdMin: 0,
  flat1ColdMax: 0,
  flat1UtilMin: 0,
  flat1UtilMax: 0,
  flat2ColdMin: 0,
  flat2ColdMax: 0,
  flat2UtilMin: 0,
  flat2UtilMax: 0,
  companyMin: 0,
  companyMax: 0,
  foodMin: 0,
  foodMax: 0,
  transport: 63,
  depositMonths: 3,
  sourceNote: '',
  checkedAt: today(),
  active: true,
  sortOrder: 0,
});

const errorOf = (err: unknown): string => {
  const data = (err as { response?: { data?: { error?: string; issues?: { message?: string }[] } } }).response?.data;
  return data?.error === 'VALIDATION' ? data.issues?.[0]?.message ?? 'generic' : data?.error ?? 'generic';
};

/** Admin → Sayt → Şəhər xərcləri: cost data of the first-month budget calculator (ADMIN+, audited server-side). */
export default function AdminCityCosts() {
  const { t } = useTranslation();
  const { date } = useL10n();
  usePageTitle(t('budget.admin.title'));
  const qc = useQueryClient();
  const [edit, setEdit] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [remove, setRemove] = useState<Row | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'city-costs'], queryFn: async () => (await api.get<{ rows: Row[] }>('/admin/city-costs')).data });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'city-costs'] });
    void qc.invalidateQueries({ queryKey: ['budget'] });
  };

  const save = useMutation({
    mutationFn: async (e: { id: string | null; draft: Draft }) => {
      const body = { ...e.draft, aliases: e.draft.aliases?.trim() || null, sourceNote: e.draft.sourceNote?.trim() || null, state: e.draft.kind === 'GENERIC' && !e.draft.state ? null : e.draft.state };
      return e.id ? api.put(`/admin/city-costs/${e.id}`, body) : api.post('/admin/city-costs', body);
    },
    onSuccess: () => {
      toast.success(t('budget.admin.saved'));
      setEdit(null);
      refresh();
    },
    onError: (err) => toast.error(t(`budget.admin.errors.${errorOf(err)}`, { defaultValue: t('budget.admin.errors.generic') })),
  });
  const del = useMutation({
    mutationFn: async (row: Row) => api.delete(`/admin/city-costs/${row.id}`),
    onSuccess: () => {
      toast.success(t('budget.admin.deleted'));
      setRemove(null);
      refresh();
    },
    onError: () => toast.error(t('budget.admin.errors.generic')),
  });
  const restore = useMutation({
    mutationFn: async () => (await api.post<{ added: number }>('/admin/city-costs/restore-defaults')).data,
    onSuccess: (d) => {
      toast.success(t('budget.admin.restored', { count: d.added }));
      refresh();
    },
    onError: () => toast.error(t('budget.admin.errors.generic')),
  });

  const rng = (a: number, b: number) => <span className="whitespace-nowrap">{`${a}–${b} €`}</span>;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (edit) save.mutate(edit);
  };
  const d = edit?.draft;
  const setD = (patch: Partial<Draft>) => setEdit((x) => (x ? { ...x, draft: { ...x.draft, ...patch } } : x));
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  return (
    <div className="stack-page">
      <PageHeader
        title={t('budget.admin.title')}
        subtitle={t('budget.admin.subtitle')}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={RotateCcw} loading={restore.isPending} onClick={() => restore.mutate()}>
              {t('budget.admin.restore')}
            </Button>
            <Button size="sm" icon={Plus} onClick={() => setEdit({ id: null, draft: emptyDraft() })}>
              {t('budget.admin.add')}
            </Button>
          </>
        }
      />
      <Table
        rows={data?.rows}
        loading={isLoading}
        rowKey={(r) => r.id}
        stackOnMobile
        empty={<EmptyState compact icon={MapPinned} title={t('budget.admin.empty')} />}
        columns={[
          {
            key: 'name',
            header: t('budget.admin.cols.name'),
            primary: true,
            cell: (r) => (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-ink">{r.name}</span>
                {r.state && <span className="text-xs text-muted">{r.state}</span>}
                {r.kind === 'GENERIC' && <Badge tone="brand">{t('budget.admin.generic')}</Badge>}
                {!r.active && <Badge tone="neutral">{t('budget.admin.inactive')}</Badge>}
              </span>
            ),
          },
          { key: 'wg', header: t('budget.admin.cols.wg'), numeric: true, cell: (r) => rng(r.wgMin, r.wgMax) },
          { key: 'flat1', header: t('budget.admin.cols.flat1'), numeric: true, cell: (r) => (
              <>
                {rng(r.flat1ColdMin, r.flat1ColdMax)} + {rng(r.flat1UtilMin, r.flat1UtilMax)}
              </>
            ), hideBelow: 'md' },
          { key: 'company', header: t('budget.admin.cols.company'), numeric: true, cell: (r) => rng(r.companyMin, r.companyMax), hideBelow: 'lg' },
          { key: 'food', header: t('budget.admin.cols.food'), numeric: true, cell: (r) => rng(r.foodMin, r.foodMax), hideBelow: 'lg' },
          { key: 'checkedAt', header: t('budget.admin.cols.checkedAt'), cell: (r) => date(r.checkedAt) },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (r) => (
              <span className="inline-flex gap-1">
                <IconButton icon={Pencil} label={t('budget.admin.edit')} size="sm" onClick={() => setEdit({ id: r.id, draft: { ...r, checkedAt: r.checkedAt.slice(0, 10), aliases: r.aliases ?? '', sourceNote: r.sourceNote ?? '' } })} />
                <IconButton icon={Trash2} label={t('budget.admin.deleteTitle', { name: r.name })} variant="danger" size="sm" onClick={() => setRemove(r)} />
              </span>
            ),
          },
        ]}
      />

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? t('budget.admin.edit') : t('budget.admin.add')}
        size="xl"
        as="form"
        onSubmit={submit}
        busy={save.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {d && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">{t('budget.admin.f.name')}</span>
                <input className="input" required minLength={2} maxLength={80} value={d.name} onChange={(e) => setD({ name: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">{t('budget.admin.f.slug')}</span>
                <input className="input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={60} value={d.slug} onChange={(e) => setD({ slug: e.target.value.toLowerCase() })} />
              </label>
              <label className="block">
                <span className="label">{t('budget.admin.f.kind')}</span>
                <select className="input" value={d.kind} onChange={(e) => setD({ kind: e.target.value as Draft['kind'] })}>
                  {(['CITY', 'GENERIC'] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`budget.admin.f.kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">{t('budget.admin.f.state')}</span>
                <select className="input" value={d.state ?? ''} onChange={(e) => setD({ state: e.target.value || null })}>
                  {d.kind === 'GENERIC' && <option value="">—</option>}
                  {FEDERAL_STATES.map((s) => (
                    <option key={s} value={s}>
                      {STATE_NAMES[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">{t('budget.admin.f.sizeClass')}</span>
                <select className="input" value={d.sizeClass} onChange={(e) => setD({ sizeClass: e.target.value as SizeClass })}>
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {t(`budget.admin.f.sizes.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">{t('budget.admin.f.checkedAt')}</span>
                <input className="input" type="date" required value={d.checkedAt} onChange={(e) => setD({ checkedAt: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="label">{t('budget.admin.f.aliases')}</span>
              <input className="input" maxLength={2000} value={d.aliases ?? ''} onChange={(e) => setD({ aliases: e.target.value })} />
              <span className="mt-1 block text-xs text-muted">{t('budget.admin.f.aliasesHint')}</span>
            </label>

            <fieldset className="rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-semibold text-ink">€ / {t('budget.result.perMonth')}</legend>
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {PAIRS.map((p) => (
                  <div key={p} className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <span className="text-sm text-ink">{t(`budget.admin.f.${p}`)}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <input
                        className="input w-24 py-1.5 text-right tabular-nums"
                        type="number"
                        min={0}
                        max={20000}
                        required
                        aria-label={`${t(`budget.admin.f.${p}`)} ${t('budget.admin.f.min')}`}
                        value={d[`${p}Min`]}
                        onChange={(e) => setD({ [`${p}Min`]: num(e.target.value) } as Partial<Draft>)}
                      />
                      –
                      <input
                        className="input w-24 py-1.5 text-right tabular-nums"
                        type="number"
                        min={0}
                        max={20000}
                        required
                        aria-label={`${t(`budget.admin.f.${p}`)} ${t('budget.admin.f.max')}`}
                        value={d[`${p}Max`]}
                        onChange={(e) => setD({ [`${p}Max`]: num(e.target.value) } as Partial<Draft>)}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="label">{t('budget.admin.f.transport')}</span>
                <input className="input tabular-nums" type="number" min={0} max={1000} value={d.transport} onChange={(e) => setD({ transport: num(e.target.value) })} />
              </label>
              <label className="block">
                <span className="label">{t('budget.admin.f.depositMonths')}</span>
                <input className="input tabular-nums" type="number" min={0} max={3} step={0.5} value={d.depositMonths} onChange={(e) => setD({ depositMonths: Math.min(3, Math.max(0, Number(e.target.value) || 0)) })} />
              </label>
              <label className="block">
                <span className="label">{t('budget.admin.f.sortOrder')}</span>
                <input className="input tabular-nums" type="number" min={0} value={d.sortOrder} onChange={(e) => setD({ sortOrder: num(e.target.value) })} />
              </label>
            </div>
            <label className="block">
              <span className="label">{t('budget.admin.f.sourceNote')}</span>
              <textarea className="input min-h-20" maxLength={2000} value={d.sourceNote ?? ''} onChange={(e) => setD({ sourceNote: e.target.value })} />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-4 accent-primary" checked={d.active} onChange={(e) => setD({ active: e.target.checked })} />
              {t('budget.admin.f.active')}
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        onConfirm={() => remove && del.mutate(remove)}
        loading={del.isPending}
        title={t('budget.admin.deleteTitle', { name: remove?.name ?? '' })}
        message={t('budget.admin.deleteText')}
        confirmLabel={t('common.delete')}
      />
    </div>
  );
}

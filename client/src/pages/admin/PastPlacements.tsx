import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ExternalLink, History, Info, MapPinned, Pencil, Plus, Settings, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table } from '@/components/ui/Table';
import { Panel } from '@/components/admin/ui';
import { STATE_NAMES, type FederalState } from '@/components/budget/api';
import { registerCopy } from '@/i18n';
import { pagesPastPlacements } from '@/i18n/pagesPastPlacements';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesPastPlacements);

/** Shapes of GET /api/admin/past-placements (server/src/routes/admin/pastPlacements.ts). */
interface Row {
  id: string;
  city: string;
  citySlug: string | null;
  state: FederalState | null;
  profession: string | null;
  count: number;
  year: number | null;
  note: string | null;
  updatedAt: string;
}
interface PreviewCity {
  city: string;
  workers: number;
  computed: number;
  past: number;
  published: boolean;
}
interface Overview {
  rows: Row[];
  total: number;
  options: {
    cities: { slug: string; name: string; state: FederalState | null }[];
    professions: { key: string; labels: Record<string, string> }[];
    states: FederalState[];
    maxYear: number;
  };
  preview: {
    mapEnabled: boolean;
    showOnHome: boolean;
    useCases: boolean;
    minPerCity: number;
    total: number;
    cities: PreviewCity[];
  };
}
interface Draft {
  city: string;
  state: FederalState | '';
  profession: string;
  count: string;
  year: string;
  note: string;
}

const QK = ['admin', 'past-placements'];
const emptyDraft = (): Draft => ({ city: '', state: '', profession: '', count: '', year: '', note: '' });

/**
 * Admin → Site → Past placements: the agency's real historical placements (aggregates per city) that are added to
 * the public placement map. STAFF see the list and the preview, ADMIN+ edit. Every change is audited server-side.
 */
export default function AdminPastPlacements() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('pastPlacements.title'));
  const { user } = useAuth();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const lang = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const [edit, setEdit] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [remove, setRemove] = useState<Row | null>(null);
  const { data, isLoading } = useQuery({ queryKey: QK, queryFn: async () => (await api.get<Overview>('/admin/past-placements')).data });

  const professionLabel = (key: string | null) => {
    if (!key) return '—';
    const p = data?.options.professions.find((x) => x.key === key);
    return p ? (p.labels[lang] ?? p.labels.en ?? key) : key;
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: QK });
    // Public map data (home globe, /map, stories) and the admin map preview.
    void qc.invalidateQueries({ queryKey: ['globe-map'] });
    void qc.invalidateQueries({ queryKey: ['growth', 'map'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'growth', 'map'] });
  };

  const save = useMutation({
    mutationFn: async (e: { id: string | null; draft: Draft }) => {
      const d = e.draft;
      const body = {
        city: d.city.trim(),
        state: d.state || null,
        profession: d.profession || null,
        count: Number(d.count),
        year: d.year ? Number(d.year) : null,
        note: d.note.trim() || null,
      };
      return e.id ? api.put(`/admin/past-placements/${e.id}`, body) : api.post('/admin/past-placements', body);
    },
    onSuccess: () => {
      toast.success(t('pastPlacements.saved'));
      setEdit(null);
      refresh();
    },
    onError: () => toast.error(t('pastPlacements.error')),
  });
  const del = useMutation({
    mutationFn: async (row: Row) => api.delete(`/admin/past-placements/${row.id}`),
    onSuccess: () => {
      toast.success(t('pastPlacements.deleted'));
      setRemove(null);
      refresh();
    },
    onError: () => toast.error(t('pastPlacements.error')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (edit) save.mutate(edit);
  };
  const d = edit?.draft;
  const setD = (patch: Partial<Draft>) => setEdit((x) => (x ? { ...x, draft: { ...x.draft, ...patch } } : x));
  const min = data?.preview.minPerCity ?? 3;
  const preview = data?.preview;
  const shownCities = preview?.cities.filter((c) => c.published).length ?? 0;

  return (
    <div className="stack-page">
      <PageHeader
        title={t('pastPlacements.title')}
        subtitle={t('pastPlacements.subtitle')}
        actions={
          canEdit ? (
            <Button size="sm" icon={Plus} onClick={() => setEdit({ id: null, draft: emptyDraft() })}>
              {t('pastPlacements.add')}
            </Button>
          ) : undefined
        }
      />

      <p className="flex items-start gap-2 rounded-xl border border-line bg-card p-3 text-sm text-ink">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          {t('pastPlacements.realOnly', { min })}
          {!canEdit && <span className="mt-1 block text-muted">{t('pastPlacements.readOnly')}</span>}
        </span>
      </p>

      {data && data.rows.length > 0 && <p className="text-sm text-muted">{t('pastPlacements.summary', { rows: data.rows.length, workers: data.total })}</p>}

      <Table
        rows={data?.rows}
        loading={isLoading}
        rowKey={(r) => r.id}
        stackOnMobile
        empty={<EmptyState compact icon={History} title={t('pastPlacements.empty')} />}
        columns={[
          {
            key: 'city',
            header: t('pastPlacements.cols.city'),
            primary: true,
            cell: (r) => (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-ink">{r.city}</span>
                {r.state && <span className="text-xs text-muted">{STATE_NAMES[r.state] ?? r.state}</span>}
              </span>
            ),
          },
          { key: 'profession', header: t('pastPlacements.cols.profession'), cell: (r) => professionLabel(r.profession) },
          { key: 'count', header: t('pastPlacements.cols.count'), numeric: true, cell: (r) => <span className="font-semibold tabular-nums">{r.count}</span> },
          { key: 'year', header: t('pastPlacements.cols.year'), cell: (r) => r.year ?? '—' },
          { key: 'note', header: t('pastPlacements.cols.note'), hideBelow: 'md', cell: (r) => <span className="text-muted">{r.note ?? '—'}</span> },
          ...(canEdit
            ? [
                {
                  key: 'actions',
                  header: '',
                  align: 'right' as const,
                  cell: (r: Row) => (
                    <span className="inline-flex gap-1">
                      <IconButton
                        icon={Pencil}
                        label={`${t('pastPlacements.edit')}: ${r.city}`}
                        size="sm"
                        onClick={() =>
                          setEdit({
                            id: r.id,
                            draft: { city: r.city, state: r.state ?? '', profession: r.profession ?? '', count: String(r.count), year: r.year ? String(r.year) : '', note: r.note ?? '' },
                          })
                        }
                      />
                      <IconButton icon={Trash2} label={t('pastPlacements.deleteTitle', { city: r.city })} variant="danger" size="sm" onClick={() => setRemove(r)} />
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      <Panel
        title={t('pastPlacements.preview.title')}
        icon={MapPinned}
        actions={
          <span className="inline-flex flex-wrap gap-2">
            <Link to="/map" target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary hover:underline">
              {t('pastPlacements.preview.openMap')} <ExternalLink className="size-3.5" aria-hidden />
            </Link>
            <Link to="/admin/site-tools" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary hover:underline">
              <Settings className="size-3.5" aria-hidden /> {t('pastPlacements.preview.settings')}
            </Link>
          </span>
        }
      >
        <p className="text-sm text-muted">{t('pastPlacements.preview.subtitle', { min })}</p>
        {preview && (!preview.mapEnabled || !preview.showOnHome || !preview.useCases) && (
          <ul className="mt-2 space-y-1 text-sm text-warning-fg">
            {!preview.mapEnabled && (
              <li className="flex items-start gap-1.5">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('pastPlacements.preview.mapOff')}
              </li>
            )}
            {preview.mapEnabled && !preview.showOnHome && (
              <li className="flex items-start gap-1.5">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('pastPlacements.preview.homeOff')}
              </li>
            )}
            {!preview.useCases && (
              <li className="flex items-start gap-1.5">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('pastPlacements.preview.casesOff')}
              </li>
            )}
          </ul>
        )}
        {preview && preview.cities.length > 0 && (
          <p className="mt-3 font-semibold text-ink">{t('pastPlacements.preview.total', { workers: preview.total, cities: shownCities })}</p>
        )}
        <div className="mt-3">
          <Table
            rows={preview?.cities}
            loading={isLoading}
            rowKey={(c) => c.city}
            stackOnMobile
            empty={<EmptyState compact icon={MapPinned} title={t('pastPlacements.preview.empty')} />}
            columns={[
              { key: 'city', header: t('pastPlacements.preview.city'), primary: true, cell: (c) => <span className="font-semibold text-ink">{c.city}</span> },
              { key: 'workers', header: t('pastPlacements.preview.workers'), numeric: true, cell: (c) => <span className="font-semibold tabular-nums">{c.workers}</span> },
              { key: 'computed', header: t('pastPlacements.preview.fromCases'), numeric: true, cell: (c) => <span className="tabular-nums">{c.computed}</span> },
              { key: 'past', header: t('pastPlacements.preview.fromPast'), numeric: true, cell: (c) => <span className="tabular-nums">{c.past}</span> },
              {
                key: 'status',
                header: t('pastPlacements.preview.status'),
                cell: (c) =>
                  c.published ? <Badge tone="success">{t('pastPlacements.preview.published')}</Badge> : <Badge tone="neutral">{t('pastPlacements.preview.withheld', { min })}</Badge>,
              },
            ]}
          />
        </div>
      </Panel>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? t('pastPlacements.edit') : t('pastPlacements.add')}
        size="lg"
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
        {d && data && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{t('pastPlacements.realOnly', { min })}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">{t('pastPlacements.f.city')}</span>
                <input
                  className="input"
                  required
                  minLength={2}
                  maxLength={80}
                  list="past-placement-cities"
                  autoComplete="off"
                  value={d.city}
                  onChange={(e) => {
                    const city = e.target.value;
                    const known = data.options.cities.find((c) => c.name.toLowerCase() === city.trim().toLowerCase());
                    setD(known?.state && !d.state ? { city, state: known.state } : { city });
                  }}
                />
                <datalist id="past-placement-cities">
                  {data.options.cities.map((c) => (
                    <option key={c.slug} value={c.name}>
                      {c.state ? STATE_NAMES[c.state] : ''}
                    </option>
                  ))}
                </datalist>
                <span className="mt-1 block text-xs text-muted">{t('pastPlacements.f.cityHint')}</span>
              </label>
              <label className="block">
                <span className="label">{t('pastPlacements.f.state')}</span>
                <select className="input" value={d.state} onChange={(e) => setD({ state: e.target.value as Draft['state'] })}>
                  <option value="">{t('pastPlacements.f.stateAuto')}</option>
                  {data.options.states.map((s) => (
                    <option key={s} value={s}>
                      {STATE_NAMES[s] ?? s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">{t('pastPlacements.f.profession')}</span>
                <select className="input" value={d.profession} onChange={(e) => setD({ profession: e.target.value })}>
                  <option value="">{t('pastPlacements.f.professionNone')}</option>
                  {data.options.professions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.labels[lang] ?? p.labels.en ?? p.key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">{t('pastPlacements.f.count')}</span>
                <input className="input tabular-nums" type="number" inputMode="numeric" required min={1} max={100000} step={1} value={d.count} onChange={(e) => setD({ count: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">{t('pastPlacements.f.year')}</span>
                <input className="input tabular-nums" type="number" inputMode="numeric" min={1990} max={data.options.maxYear} step={1} value={d.year} onChange={(e) => setD({ year: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="label">{t('pastPlacements.f.note')}</span>
              <input className="input" maxLength={300} placeholder={t('pastPlacements.f.notePlaceholder')} value={d.note} onChange={(e) => setD({ note: e.target.value })} />
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        onConfirm={() => remove && del.mutate(remove)}
        loading={del.isPending}
        title={t('pastPlacements.deleteTitle', { city: remove?.city ?? '' })}
        message={t('pastPlacements.deleteText')}
        confirmLabel={t('common.delete')}
      />
    </div>
  );
}

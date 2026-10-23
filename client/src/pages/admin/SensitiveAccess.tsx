import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, KeyRound, Save, ShieldHalf } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPrivacyTools } from '@/i18n/pagesPrivacyTools';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { fmtDateTime, toastError } from '@/components/admin/labels';

registerCopy(pagesPrivacyTools);

const GROUPS = ['PASSPORT', 'ID_NUMBER', 'IBAN', 'TAX_ID', 'BIRTH_PLACE'] as const;
type Group = (typeof GROUPS)[number];
const ROLES = ['STAFF', 'ADMIN'] as const;
type MaskRole = (typeof ROLES)[number];
type Settings = Record<MaskRole, Group[]>;
const ENTITIES = ['user', 'company', 'agent', 'invoiceSettings', 'document', 'insight'] as const;
const FIELDS = ['passportNumber', 'documentNumber', 'iban', 'bic', 'vatId', 'taxNumber'] as const;

interface RevealRow {
  id: string;
  at: string;
  actor: { id: string; name: string; role: string } | null;
  entity: string;
  entityId: string;
  field: string;
  reason: string;
  ip: string | null;
}

const MaskingSettings = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-sensitive-settings'],
    queryFn: async () => (await api.get<{ settings: Settings }>('/admin/sensitive/settings')).data.settings,
  });
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setForm({ STAFF: [...data.STAFF], ADMIN: [...data.ADMIN] });
  }, [data]);

  const toggle = (role: MaskRole, g: Group) =>
    setForm((f) => (f ? { ...f, [role]: f[role].includes(g) ? f[role].filter((x) => x !== g) : [...f[role], g] } : f));
  const dirty = !!form && !!data && ROLES.some((r) => [...form[r]].sort().join() !== [...data[r]].sort().join());

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await api.put<{ settings: Settings }>('/admin/sensitive/settings', form);
      qc.setQueryData(['admin-sensitive-settings'], res.data.settings);
      toast.success(t('privacyTools.access.saved'));
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title={t('privacyTools.access.settingsTitle')}
      icon={ShieldHalf}
      actions={
        <button type="button" className="btn-primary btn-sm" disabled={!dirty || saving} onClick={() => void save()}>
          <Save className="size-4" aria-hidden /> {t('privacyTools.access.save')}
        </button>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('privacyTools.access.settingsIntro')}</p>
      {isLoading || !form ? (
        error ? <ErrorBlock error={error} onRetry={() => void refetch()} /> : <LoadingBlock />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-semibold" />
                {ROLES.map((r) => (
                  <th key={r} className="px-3 py-2 text-center font-semibold">
                    {t(`privacyTools.access.role.${r}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {GROUPS.map((g) => (
                <tr key={g}>
                  <td className="py-2.5 pr-3 font-medium text-ink">{t(`privacyTools.access.groups.${g}`)}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand-600"
                        checked={form[r].includes(g)}
                        onChange={() => toggle(r, g)}
                        aria-label={`${t(`privacyTools.access.role.${r}`)} · ${t(`privacyTools.access.groups.${g}`)}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

const RevealLog = () => {
  const { t } = useTranslation();
  const [actorId, setActorId] = useState('');
  const [entity, setEntity] = useState('');
  const [field, setField] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(qInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [qInput]);
  useEffect(() => setPage(1), [actorId, entity, field, from, to, q]);

  const params = useMemo(
    () => Object.fromEntries(Object.entries({ actorId, entity, field, from, to, q }).filter(([, v]) => v)),
    [actorId, entity, field, from, to, q],
  );
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-sensitive-reveals', params, page],
    queryFn: async () =>
      (await api.get<{ items: RevealRow[]; hasMore: boolean; actors: { id: string; name: string }[] }>('/admin/sensitive/reveals', { params: { ...params, page } })).data,
    placeholderData: (prev) => prev,
  });
  const csvHref = `/api/admin/sensitive/reveals.csv?${new URLSearchParams(params as Record<string, string>).toString()}`;

  return (
    <Panel
      title={t('privacyTools.access.logTitle')}
      icon={KeyRound}
      actions={
        <a href={csvHref} className="btn-white btn-sm border border-line" download>
          <Download className="size-4" aria-hidden /> {t('privacyTools.access.exportCsv')}
        </a>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block">
          <span className="label">{t('privacyTools.access.filters.actor')}</span>
          <select className="input" value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">{t('privacyTools.access.filters.all')}</option>
            {(data?.actors ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t('privacyTools.access.filters.entity')}</span>
          <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">{t('privacyTools.access.filters.all')}</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {t(`privacyTools.access.entities.${e}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t('privacyTools.access.filters.field')}</span>
          <select className="input" value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">{t('privacyTools.access.filters.all')}</option>
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {t(`privacyTools.sensitive.fields.${f}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t('privacyTools.access.filters.from')}</span>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('privacyTools.access.filters.to')}</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">&nbsp;</span>
          <input type="search" className="input" value={qInput} placeholder={t('privacyTools.access.filters.search')} onChange={(e) => setQInput(e.target.value)} />
        </label>
      </div>

      {error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <LoadingBlock />
      ) : !data.items.length ? (
        <EmptyState icon={KeyRound} title={t('privacyTools.access.empty')} />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-semibold">{t('privacyTools.access.th.when')}</th>
                  <th className="px-3 py-2 font-semibold">{t('privacyTools.access.th.who')}</th>
                  <th className="px-3 py-2 font-semibold">{t('privacyTools.access.th.what')}</th>
                  <th className="px-3 py-2 font-semibold">{t('privacyTools.access.th.reason')}</th>
                  <th className="py-2 pl-3 font-semibold">{t('privacyTools.access.th.ip')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="py-2.5 pr-3 text-xs whitespace-nowrap text-muted">{fmtDateTime(r.at)}</td>
                    <td className="px-3 py-2.5 font-medium text-ink">{r.actor?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className="font-semibold text-ink">{t(`privacyTools.sensitive.fields.${r.field}`, { defaultValue: r.field })}</span>
                      <span className="block text-muted">
                        {t(`privacyTools.access.entities.${r.entity}`, { defaultValue: r.entity })} · <span className="font-mono">{r.entityId}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 break-words text-ink/90">{r.reason}</td>
                    <td className="py-2.5 pl-3 font-mono text-xs text-muted">{r.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {data.items.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-ink">{r.actor?.name ?? '—'}</p>
                  <p className="text-xs whitespace-nowrap text-muted">{fmtDateTime(r.at)}</p>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {t(`privacyTools.sensitive.fields.${r.field}`, { defaultValue: r.field })} · {t(`privacyTools.access.entities.${r.entity}`, { defaultValue: r.entity })}
                </p>
                <p className="mt-1.5 break-words">{r.reason}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <button type="button" className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t('privacyTools.access.prev')}
            </button>
            <span className="text-muted">{t('privacyTools.access.page', { page })}</span>
            <button type="button" className="btn-ghost btn-sm" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
              {t('privacyTools.access.next')}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
};

/** SUPER_ADMIN: masking rules per role and the log of every "reveal with reason". */
export default function SensitiveAccess() {
  const { t } = useTranslation();
  usePageTitle(t('privacyTools.access.title'));
  return (
    <div className="space-y-6">
      <PageHead title={t('privacyTools.access.title')} subtitle={t('privacyTools.access.subtitle')} />
      <MaskingSettings />
      <RevealLog />
    </div>
  );
}

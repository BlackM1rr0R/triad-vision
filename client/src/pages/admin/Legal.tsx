import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Copy, ExternalLink, FilePlus2, Pencil, Save, ScrollText, Send, Trash2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import type { L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesLegalDocs } from '@/i18n/pagesLegalDocs';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusPill } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { Markdown } from '@/components/ops/Markdown';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { L10nInput, LANGS, LangTag, emptyL10n, type Lang } from '@/components/admin/L10nInput';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { LEGAL_PATH, versionPath, type LegalKind, type LegalStatus } from '@/components/legal/api';

registerCopy(pagesLegalDocs);

const LIST_KEY = ['admin-legal'] as const;

interface VersionRow {
  id: string;
  kind: LegalKind;
  version: string;
  title: L10n;
  status: LegalStatus;
  requiresReacceptance: boolean;
  publishedAt: string | null;
  effectiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}
interface KindBlock {
  kind: LegalKind;
  current: { id: string | null; version: string; fallback: boolean; accepted: number };
  versions: VersionRow[];
}
interface FullDoc extends VersionRow {
  body: L10n;
  changeSummary: L10n | null;
}
type DiffLine = { op: 'same' | 'add' | 'del'; text: string };

const useLegalError = () => {
  const { t, i18n } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    toast.error(i18n.exists(`legalDocs.admin.errors.${code}`) ? t(`legalDocs.admin.errors.${code}`) : i18n.exists(`admin.errors.${code}`) ? t(`admin.errors.${code}`) : t('common.error'));
  };
};

// ─── Versions list ─────────────────────────────────────────────────────

const VersionsList = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const onError = useLegalError();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: LIST_KEY, queryFn: async () => (await api.get<{ kinds: KindBlock[] }>('/admin/legal')).data.kinds });
  const create = useMutation({
    mutationFn: async (v: { kind: LegalKind; copyFromId?: string }) => (await api.post<{ item: FullDoc }>('/admin/legal', v)).data.item,
    onSuccess: (item) => {
      toast.success(t('legalDocs.admin.created'));
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      navigate(`/admin/legal/${item.id}`);
    },
    onError,
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      {data.map((k) => (
        <Panel
          key={k.kind}
          title={t(`legalDocs.admin.kinds.${k.kind}`)}
          icon={ScrollText}
          actions={
            <div className="flex flex-wrap gap-2">
              <a href={LEGAL_PATH[k.kind]} target="_blank" rel="noopener" className="btn-secondary btn-sm">
                <ExternalLink className="size-3.5" aria-hidden /> {t('legalDocs.admin.publicLink')}
              </a>
              <Button size="sm" icon={FilePlus2} loading={create.isPending && create.variables?.kind === k.kind} onClick={() => create.mutate({ kind: k.kind })}>
                {t('legalDocs.admin.newVersion')}
              </Button>
            </div>
          }
        >
          <p className="mb-3 text-sm text-muted">
            {t('legalDocs.admin.current')}: <b className="text-ink">{k.current.version}</b>
            {k.current.fallback ? <span className="ml-2">({t('legalDocs.admin.fallback')})</span> : <span className="ml-2">· {t('legalDocs.admin.acceptedCount', { count: k.current.accepted })}</span>}
          </p>
          {!k.versions.length ? (
            <EmptyState icon={ScrollText} title={t('legalDocs.admin.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="bg-sunken text-left text-xs text-muted">
                  <tr>
                    {(['version', 'status', 'published', 'effective', 'reaccept'] as const).map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">
                        {t(`legalDocs.admin.cols.${c}`)}
                      </th>
                    ))}
                    <th className="w-24 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {k.versions.map((v) => (
                    <tr key={v.id} className={clsx(v.status === 'ARCHIVED' && 'opacity-75')}>
                      <td className="px-3 py-2 font-semibold text-ink">{v.version}</td>
                      <td className="px-3 py-2">
                        <StatusPill domain="publication" status={v.status} label={t(`legalDocs.admin.status.${v.status}`)} />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted tabular-nums">{v.publishedAt ? fmtDateTime(v.publishedAt) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted tabular-nums">{v.effectiveAt ? fmtDate(v.effectiveAt) : '—'}</td>
                      <td className="px-3 py-2 text-xs">{v.requiresReacceptance ? <b className="text-warning-fg">{t('legalDocs.admin.yes')}</b> : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Link to={`/admin/legal/${v.id}`} className="btn-secondary btn-sm">
                          {v.status === 'DRAFT' ? <Pencil className="size-3.5" aria-hidden /> : null}
                          {v.status === 'DRAFT' ? t('legalDocs.admin.edit') : t('legalDocs.admin.view')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
};

// ─── Editor ────────────────────────────────────────────────────────────

const DiffView = ({ id, lang, enabled }: { id: string; lang: Lang; enabled: boolean }) => {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-legal-diff', id, lang],
    queryFn: async () => (await api.get<{ previous: { version: string } | null; lines: DiffLine[]; stats: { added: number; removed: number } }>(`/admin/legal/${id}/diff?lang=${lang}`)).data,
    enabled,
  });
  if (isLoading || !data) return <LoadingBlock />;
  const changed = data.stats.added + data.stats.removed > 0;
  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {data.previous ? t('legalDocs.admin.diffAgainst', { version: data.previous.version }) : t('legalDocs.admin.diffNone')} · {t('legalDocs.admin.diffStats', data.stats)}
      </p>
      {!changed && data.previous ? (
        <p className="rounded-lg border border-line bg-sunken p-4 text-sm text-muted">{t('legalDocs.admin.noChanges')}</p>
      ) : (
        <pre className="max-h-[60vh] overflow-auto rounded-lg border border-line bg-card p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap" lang={lang}>
          {data.lines.map((l, i) => (
            <div key={i} className={clsx('px-2', l.op === 'add' && 'bg-success-bg text-success-fg', l.op === 'del' && 'bg-danger-bg text-danger-fg line-through decoration-danger/40')}>
              <span aria-hidden className="mr-2 inline-block w-3 select-none">
                {l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '}
              </span>
              <span className="sr-only">{l.op === 'add' ? '+' : l.op === 'del' ? '−' : ''}</span>
              {l.text || ' '}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
};

type Draft = { version: string; title: L10n; body: L10n; changeSummary: L10n; requiresReacceptance: boolean; effectiveAt: string };

const toDraft = (d: FullDoc): Draft => ({
  version: d.version,
  title: { ...emptyL10n(), ...d.title },
  body: { ...emptyL10n(), ...d.body },
  changeSummary: { ...emptyL10n(), ...(d.changeSummary ?? {}) },
  requiresReacceptance: d.requiresReacceptance,
  effectiveAt: d.effectiveAt ? d.effectiveAt.slice(0, 10) : '',
});

const Editor = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onError = useLegalError();
  const key = ['admin-legal-doc', id];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ item: FullDoc; previous: { id: string; version: string } | null; accepted: number }>(`/admin/legal/${id}`)).data,
  });
  const [d, setD] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lang, setLang] = useState<Lang>('de');
  const [tab, setTab] = useState<'edit' | 'preview' | 'diff'>('edit');
  const [confirm, setConfirm] = useState<'publish' | 'delete' | null>(null);
  useEffect(() => {
    if (data) {
      setD(toDraft(data.item));
      setDirty(false);
      if (data.item.status !== 'DRAFT') setTab((k) => (k === 'edit' ? 'preview' : k));
    }
  }, [data]);
  const doc = data?.item;
  const editable = doc?.status === 'DRAFT';
  usePageTitle(t('legalDocs.admin.title'));

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => (p ? { ...p, [k]: v } : p));
    setDirty(true);
  };

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: LIST_KEY });
    void qc.invalidateQueries({ queryKey: ['admin-legal-diff', id] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!d) return;
      await api.put(`/admin/legal/${id}`, {
        version: d.version.trim(),
        title: d.title,
        body: d.body,
        changeSummary: Object.values(d.changeSummary).some((v) => v.trim()) ? d.changeSummary : null,
        requiresReacceptance: d.requiresReacceptance,
        effectiveAt: d.effectiveAt ? new Date(`${d.effectiveAt}T00:00:00Z`).toISOString() : null,
      });
    },
    onSuccess: () => {
      setDirty(false);
      refreshAll();
    },
    onError,
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync();
      await api.post(`/admin/legal/${id}/publish`);
    },
    onSuccess: () => {
      toast.success(t('legalDocs.admin.published'));
      setConfirm(null);
      refreshAll();
      void qc.invalidateQueries({ queryKey: ['legal'] });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/admin/legal/${id}`),
    onSuccess: () => {
      toast.success(t('legalDocs.admin.deleted'));
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      navigate('/admin/legal');
    },
    onError,
  });
  const copy = useMutation({
    mutationFn: async () => (await api.post<{ item: FullDoc }>('/admin/legal', { kind: doc!.kind, copyFromId: doc!.id })).data.item,
    onSuccess: (item) => {
      toast.success(t('legalDocs.admin.created'));
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      navigate(`/admin/legal/${item.id}`);
    },
    onError,
  });

  const changeTab = async (k: 'edit' | 'preview' | 'diff') => {
    // The diff is computed on the server from the saved text.
    if (k === 'diff' && editable && dirty) await save.mutateAsync().catch(() => undefined);
    setTab(k);
  };

  const filled = useMemo(() => (d ? LANGS.filter((l) => d.body[l].trim()) : []), [d]);

  if (isLoading) return <LoadingBlock />;
  if (error || !doc || !d) return <ErrorBlock error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/legal" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {t('legalDocs.admin.back')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill domain="publication" status={doc.status} label={t(`legalDocs.admin.status.${doc.status}`)} />
          {doc.status !== 'DRAFT' && (
            <a href={doc.status === 'PUBLISHED' ? LEGAL_PATH[doc.kind] : versionPath(doc.kind, doc.version)} target="_blank" rel="noopener" className="btn-secondary btn-sm">
              <ExternalLink className="size-3.5" aria-hidden /> {t('legalDocs.admin.publicLink')}
            </a>
          )}
          {editable ? (
            <>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm('delete')}>
                {t('legalDocs.admin.deleteDraft')}
              </Button>
              <Button size="sm" variant="secondary" icon={Save} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(undefined, { onSuccess: () => toast.success(t('legalDocs.admin.saved')) })}>
                {t('legalDocs.admin.save')}
              </Button>
              <Button size="sm" icon={Send} onClick={() => setConfirm('publish')}>
                {t('legalDocs.admin.publish')}
              </Button>
            </>
          ) : (
            <Button size="sm" icon={Copy} loading={copy.isPending} onClick={() => copy.mutate()}>
              {t('legalDocs.admin.newVersion')}
            </Button>
          )}
        </div>
      </div>

      <Panel title={`${t(`legalDocs.admin.kinds.${doc.kind}`)} · ${doc.version}`} icon={ScrollText}>
        {!editable && <p className="mb-4 rounded-lg border border-line bg-sunken p-3 text-sm text-muted">{t('legalDocs.admin.readOnly')}</p>}
        {data.accepted > 0 && <p className="mb-4 text-xs text-muted">{t('legalDocs.admin.acceptedCount', { count: data.accepted })}</p>}
        {editable ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">{t('legalDocs.admin.versionLabel')} *</span>
              <input className="input" required maxLength={40} pattern="[A-Za-z0-9._\-]+" value={d.version} onChange={(e) => set('version', e.target.value)} />
              <span className="mt-1 block text-xs text-muted">{t('legalDocs.admin.versionHint')}</span>
            </label>
            <label className="block">
              <span className="label">{t('legalDocs.admin.effectiveAt')}</span>
              <input className="input" type="date" value={d.effectiveAt} onChange={(e) => set('effectiveAt', e.target.value)} />
              <span className="mt-1 block text-xs text-muted">{t('legalDocs.admin.effectiveHint')}</span>
            </label>
            <div className="sm:col-span-2">
              <L10nInput label={t('legalDocs.admin.titleLabel')} value={d.title} onChange={(v) => set('title', v)} required />
            </div>
            <div className="sm:col-span-2">
              <L10nInput label={t('legalDocs.admin.summaryLabel')} value={d.changeSummary} onChange={(v) => set('changeSummary', v)} multiline rows={3} hint={t('legalDocs.admin.summaryHint')} />
            </div>
            <div className="flex items-start gap-3 sm:col-span-2">
              <Switch checked={d.requiresReacceptance} onChange={(v) => set('requiresReacceptance', v)} label={t('legalDocs.admin.reaccept')} />
              <span>
                <span className="block text-sm font-semibold text-ink">{t('legalDocs.admin.reaccept')}</span>
                <span className="block text-xs text-muted">{t('legalDocs.admin.reacceptHint')}</span>
              </span>
            </div>
          </div>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">{t('legalDocs.admin.titleLabel')}</dt>
              <dd className="font-semibold text-ink">{tr(doc.title)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('legalDocs.admin.effectiveAt')}</dt>
              <dd className="text-ink">{doc.effectiveAt ? fmtDate(doc.effectiveAt) : '—'}</dd>
            </div>
            {doc.changeSummary && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">{t('legalDocs.admin.summaryLabel')}</dt>
                <dd className="whitespace-pre-line text-ink">{tr(doc.changeSummary)}</dd>
              </div>
            )}
          </dl>
        )}
      </Panel>

      <Panel title={t('legalDocs.admin.bodyLabel')} icon={Pencil}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Tabs
            label={t('legalDocs.admin.bodyLabel')}
            idPrefix="legal-body"
            variant="pills"
            size="sm"
            value={tab}
            onChange={(k) => void changeTab(k)}
            items={(editable ? (['edit', 'preview', 'diff'] as const) : (['preview', 'diff'] as const)).map((k) => ({ key: k, label: t(`legalDocs.admin.tabs.${k}`) }))}
          />
          <div role="group" aria-label={t('admin.l10n.lang.de', { defaultValue: 'Language' })} className="flex gap-1 rounded-lg bg-sunken p-0.5">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={clsx('relative min-h-8 rounded-md px-1.5 py-1 transition', lang === l ? 'bg-card shadow-[var(--tv-shadow-card)]' : 'opacity-70 hover:opacity-100')}
              >
                <LangTag lang={l} />
                {!filled.includes(l) && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning" aria-label={t('admin.l10n.empty')} />}
              </button>
            ))}
          </div>
        </div>
        {tab === 'edit' && editable ? (
          <>
            <textarea
              className="input min-h-[50vh] font-mono text-[13px] leading-relaxed"
              lang={lang}
              value={d.body[lang]}
              onChange={(e) => set('body', { ...d.body, [lang]: e.target.value })}
              aria-label={`${t('legalDocs.admin.bodyLabel')} (${lang.toUpperCase()})`}
            />
            <p className="mt-1 text-xs text-muted">{t('legalDocs.admin.bodyHint')}</p>
          </>
        ) : tab === 'diff' ? (
          <DiffView id={id} lang={lang} enabled={tab === 'diff'} />
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-line bg-card p-4 sm:p-6" lang={lang}>
            <Markdown source={(editable ? d.body : doc.body)[lang] || ''} />
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={confirm === 'publish'}
        onClose={() => setConfirm(null)}
        onConfirm={() => publish.mutate()}
        loading={publish.isPending}
        tone="primary"
        title={t('legalDocs.admin.publishTitle')}
        message={`${t('legalDocs.admin.publishText', { version: d.version })}${d.requiresReacceptance ? ` ${t('legalDocs.admin.publishReaccept')}` : ''}`}
        confirmLabel={t('legalDocs.admin.publish')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={t('legalDocs.admin.deleteTitle')}
        confirmLabel={t('legalDocs.admin.deleteDraft')}
      />
    </div>
  );
};

export default function AdminLegal() {
  const { t } = useTranslation();
  usePageTitle(t('legalDocs.admin.title'));
  return (
    <div>
      <PageHead title={t('legalDocs.admin.title')} subtitle={t('legalDocs.admin.subtitle')} />
      <Routes>
        <Route index element={<VersionsList />} />
        <Route path=":id" element={<Editor />} />
      </Routes>
    </div>
  );
}


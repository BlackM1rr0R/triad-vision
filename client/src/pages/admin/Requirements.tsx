import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Copy, Globe, Info, ListChecks, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { hasMinRole, type L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesDocsIntel } from '@/i18n/pagesDocsIntel';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { L10nInput, LANGS, type Lang } from '@/components/admin/L10nInput';
import { TranslateButton, aiLangsOf, plainL10n, type L10nWithAi } from '@/components/admin/TranslateButton';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';

registerCopy(pagesDocsIntel);

type Stage = 'INITIAL' | 'EMBASSY';
const STAGES: Stage[] = ['INITIAL', 'EMBASSY'];

interface Template {
  id: string;
  visaCategoryId: string | null;
  stage: Stage;
  key: string | null;
  title: L10nWithAi;
  description: L10nWithAi | null;
  required: boolean;
  sortOrder: number;
}
type Lists = Record<Stage, Template[]>;
interface Data {
  visaCategories: { id: string; slug: string; title: L10n; visaLabel: string }[];
  keys: string[];
  builtIn: Record<Stage, { key: string; title: L10n; description?: L10n; required: boolean }[]>;
  templates: { global: Lists; byVisa: Record<string, Lists> };
}

const KEY = ['admin-requirement-templates'] as const;
const GLOBAL = '__global__';

const useErrorToast = () => {
  const { t, i18n } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    toast.error(i18n.exists(`docsIntel.admin.errors.${code}`) ? t(`docsIntel.admin.errors.${code}`) : t('admin.common.error', { defaultValue: code }));
  };
};

// ─── Editor (inline create / edit) ──────────────────────────────────────

interface Draft {
  key: string;
  title: L10n;
  description: L10n;
  required: boolean;
  /** Languages still holding the AI's text (shown with a badge, kept as the marker on save). */
  ai: { title: Lang[]; description: Lang[] };
}

const hasText = (v: L10n) => LANGS.some((l) => v[l].trim());
const draftOf = (tpl: Template | null): Draft => ({
  key: tpl?.key ?? '',
  title: plainL10n(tpl?.title),
  description: plainL10n(tpl?.description),
  required: tpl?.required ?? true,
  ai: { title: aiLangsOf(tpl?.title), description: aiLangsOf(tpl?.description) },
});
/** Drops the AI mark of every language whose text changed. */
const keepAi = (ai: Lang[], before: L10n, after: L10n) => ai.filter((l) => before[l] === after[l]);

const TemplateForm = ({
  initial,
  keys,
  onSave,
  onCancel,
  busy,
}: {
  initial: Draft;
  keys: string[];
  onSave: (d: Draft) => void;
  onCancel: () => void;
  busy: boolean;
}) => {
  const { t } = useTranslation();
  const [d, setD] = useState<Draft>(initial);
  const translate = (
    <TranslateButton
      fields={{ title: d.title, description: d.description }}
      ai={d.ai}
      context="title / description of a document a client must upload for a German visa application"
      disabled={busy}
      onTranslated={(values, translated) =>
        setD((cur) => ({
          ...cur,
          title: values.title,
          description: values.description,
          ai: { title: [...new Set([...cur.ai.title, ...translated.title])], description: [...new Set([...cur.ai.description, ...translated.description])] },
        }))
      }
    />
  );
  return (
    <form
      className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (hasText(d.title)) onSave(d);
      }}
    >
      <L10nInput
        label={t('docsIntel.admin.titleField')}
        value={d.title}
        onChange={(title) => setD({ ...d, title, ai: { ...d.ai, title: keepAi(d.ai.title, d.title, title) } })}
        required
        anyLang
        aiLangs={d.ai.title}
        actions={translate}
        hint={t('admin.l10n.anyLangHint')}
      />
      <L10nInput
        label={t('docsIntel.admin.description')}
        value={d.description}
        onChange={(description) => setD({ ...d, description, ai: { ...d.ai, description: keepAi(d.ai.description, d.description, description) } })}
        multiline
        rows={2}
        anyLang
        aiLangs={d.ai.description}
      />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor={`key-${initial.key}`}>
            {t('docsIntel.admin.key')}
          </label>
          <input
            id={`key-${initial.key}`}
            className="input font-mono uppercase"
            list="requirement-keys"
            value={d.key}
            placeholder={t('docsIntel.admin.keyNone')}
            onChange={(e) => setD({ ...d, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
            maxLength={40}
          />
          <datalist id="requirement-keys">
            {keys.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-muted">{t('docsIntel.admin.keyHint')}</p>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <Switch checked={d.required} onChange={(required) => setD({ ...d, required })} label={t('docsIntel.admin.required')} />
          {d.required ? t('docsIntel.admin.required') : t('docsIntel.admin.optional')}
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={busy || !hasText(d.title)}>
          {busy && <Spinner className="size-3.5" />} {t('docsIntel.admin.save')}
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
          {t('docsIntel.admin.cancel')}
        </button>
      </div>
    </form>
  );
};

// ─── One stage list ─────────────────────────────────────────────────────

const StageList = ({
  stage,
  items,
  visaCategoryId,
  keys,
  canEdit,
  onChanged,
}: {
  stage: Stage;
  items: Template[];
  visaCategoryId: string | null;
  keys: string[];
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const onError = useErrorToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState<Template | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(id);
    try {
      const res = (await fn()) as { data?: { translation?: { autoTranslated: boolean; reason: string | null } | null } } | undefined;
      await onChanged();
      const tx = res?.data?.translation;
      if (tx && !tx.autoTranslated && tx.reason && tx.reason !== 'NOTHING_TO_TRANSLATE' && tx.reason !== 'NO_SOURCE') toast.warning(t('admin.l10n.savedCopied', { reason: tx.reason }));
      else if (done) toast.success(done);
      return true;
    } catch (err) {
      onError(err);
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Languages left empty are translated by the server (AI); nothing is copied from AZ here any more.
  const trimmed = (v: L10n): L10n => ({ az: v.az.trim(), de: v.de.trim(), en: v.en.trim(), ru: v.ru.trim() });
  const payload = (d: Draft) => ({
    key: d.key.trim() || null,
    title: trimmed(d.title),
    description: hasText(d.description) ? trimmed(d.description) : null,
    required: d.required,
    ai: d.ai,
  });

  const move = async (index: number, dir: -1 | 1) => {
    const ids = items.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await run('reorder', () => api.post('/admin/requirements/reorder', { ids }));
  };

  return (
    <Panel
      title={
        <>
          {t(`docsIntel.admin.stage.${stage}`)}
          <span className="badge ml-1 bg-neutral-bg text-neutral-fg tabular-nums">{items.length}</span>
        </>
      }
      icon={ListChecks}
      actions={
        canEdit && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="size-3.5" aria-hidden /> {t('docsIntel.admin.add')}
          </button>
        )
      }
      bodyClassName="p-4 sm:p-5"
    >
      {items.length === 0 && !adding && <p className="text-sm text-muted">{t('docsIntel.admin.emptyStage')}</p>}
      <ol className="space-y-2">
        {items.map((tpl, i) => (
          <li key={tpl.id} className="rounded-lg border border-line bg-white">
            {editing === tpl.id ? (
              <div className="p-2">
                <TemplateForm
                  initial={draftOf(tpl)}
                  keys={keys}
                  busy={busy === tpl.id}
                  onCancel={() => setEditing(null)}
                  onSave={async (d) => {
                    if (await run(tpl.id, () => api.put(`/admin/requirements/${tpl.id}`, payload(d)), t('docsIntel.admin.saved'))) setEditing(null);
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                <span className="w-5 shrink-0 text-xs text-muted tabular-nums">{i + 1}.</span>
                <div className="min-w-0 flex-[1_1_14rem]">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-navy-900">
                    {tr(tpl.title)}
                    {tpl.required ? (
                      <span className="badge bg-navy-900/90 text-[10px] text-white">{t('docsIntel.admin.required')}</span>
                    ) : (
                      <span className="badge bg-neutral-bg text-[10px] text-neutral-fg">{t('docsIntel.admin.optional')}</span>
                    )}
                    {(aiLangsOf(tpl.title).length > 0 || aiLangsOf(tpl.description).length > 0) && (
                      <span className="badge bg-brand-50 text-[10px] text-brand-700" title={t('admin.l10n.aiBadgeTitle')}>
                        {t('admin.l10n.aiBadge')}: {[...new Set([...aiLangsOf(tpl.title), ...aiLangsOf(tpl.description)])].map((l) => l.toUpperCase()).join(', ')}
                      </span>
                    )}
                    {tpl.key ? (
                      <span className="badge bg-brand-100 font-mono text-[10px] text-brand-700">{tpl.key}</span>
                    ) : (
                      <span className="badge bg-slate-50 text-[10px] text-slate-400">{t('docsIntel.admin.keyNone')}</span>
                    )}
                  </p>
                  {tpl.description && tr(tpl.description) && <p className="mt-0.5 text-xs text-muted">{tr(tpl.description)}</p>}
                </div>
                {canEdit && (
                  <div className="-mr-1 flex shrink-0 items-center gap-0.5">
                    <Switch checked={tpl.required} disabled={busy === tpl.id} label={t('docsIntel.admin.required')} onChange={(required) => run(tpl.id, () => api.put(`/admin/requirements/${tpl.id}`, { required }))} />
                    <button type="button" className="ml-1 grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-navy-900 disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0 || !!busy} title={t('docsIntel.admin.moveUp')} aria-label={t('docsIntel.admin.moveUp')}>
                      <ArrowUp className="size-3.5" aria-hidden />
                    </button>
                    <button type="button" className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-navy-900 disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === items.length - 1 || !!busy} title={t('docsIntel.admin.moveDown')} aria-label={t('docsIntel.admin.moveDown')}>
                      <ArrowDown className="size-3.5" aria-hidden />
                    </button>
                    <button type="button" className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-brand-700" onClick={() => setEditing(tpl.id)} title={t('docsIntel.admin.edit')} aria-label={t('docsIntel.admin.edit')}>
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <button type="button" className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-danger" onClick={() => setDel(tpl)} title={t('docsIntel.admin.delete')} aria-label={t('docsIntel.admin.delete')}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      {adding && (
        <div className="mt-3">
          <TemplateForm
            initial={draftOf(null)}
            keys={keys}
            busy={busy === 'new'}
            onCancel={() => setAdding(false)}
            onSave={async (d) => {
              if (await run('new', () => api.post('/admin/requirements', { visaCategoryId, stage, ...payload(d) }), t('docsIntel.admin.saved'))) setAdding(false);
            }}
          />
        </div>
      )}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        loading={busy === del?.id}
        title={t('docsIntel.admin.deleteTitle')}
        message={t('docsIntel.admin.deleteMsg', { title: del ? tr(del.title) : '' })}
        confirmLabel={t('docsIntel.admin.delete')}
        onConfirm={async () => {
          if (del && (await run(del.id, () => api.delete(`/admin/requirements/${del.id}`), t('docsIntel.admin.deleted')))) setDel(null);
        }}
      />
    </Panel>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────

export default function Requirements() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const [selected, setSelected] = useState<string>(GLOBAL);
  const [busy, setBusy] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);

  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Data>('/admin/requirements')).data });
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  const lists = useMemo<Lists | null>(() => {
    if (!q.data) return null;
    if (selected === GLOBAL) return q.data.templates.global;
    return q.data.templates.byVisa[selected] ?? { INITIAL: [], EMBASSY: [] };
  }, [q.data, selected]);
  const count = (l: Lists | undefined) => (l ? l.INITIAL.length + l.EMBASSY.length : 0);
  const globalCount = count(q.data?.templates.global);
  const selectedCount = count(lists ?? undefined);
  const selectedVisa = q.data?.visaCategories.find((v) => v.id === selected);

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try {
      await fn();
      await refresh();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  };
  const seed = () =>
    act('seed', async () => {
      const res = await api.post<{ created: number }>('/admin/requirements/seed-defaults');
      toast.success(t('docsIntel.admin.seeded', { count: res.data.created }));
    });
  const copy = (replaceExisting: boolean) =>
    act('copy', async () => {
      const res = await api.post<{ count: number }>('/admin/requirements/copy-defaults', { visaCategoryId: selected, replace: replaceExisting });
      toast.success(t('docsIntel.admin.copied', { count: res.data.count }));
      setReplace(false);
    });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data || !lists) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div>
      <PageHead title={t('docsIntel.admin.title')} subtitle={t('docsIntel.admin.subtitle')} />
      <p className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('docsIntel.admin.newOnly')}
      </p>
      {!canEdit && <p className="mb-4 text-sm text-muted">{t('docsIntel.admin.readOnly')}</p>}

      <div className="grid gap-5 lg:grid-cols-[16rem_1fr] lg:items-start">
        <nav className="space-y-1 rounded-xl border border-line bg-white p-2" aria-label={t('docsIntel.admin.visaTypes')}>
          <button
            type="button"
            onClick={() => setSelected(GLOBAL)}
            className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition', selected === GLOBAL ? 'bg-navy-900 text-white' : 'hover:bg-surface')}
          >
            <Globe className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{t('docsIntel.admin.global')}</span>
              <span className={clsx('block truncate text-[11px]', selected === GLOBAL ? 'text-white/70' : 'text-muted')}>
                {globalCount ? t('docsIntel.admin.own', { count: globalCount }) : t('docsIntel.admin.builtIn')}
              </span>
            </span>
          </button>
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{t('docsIntel.admin.visaTypes')}</p>
          {q.data.visaCategories.map((v) => {
            const n = count(q.data!.templates.byVisa[v.id]);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelected(v.id)}
                className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition', selected === v.id ? 'bg-navy-900 text-white' : 'hover:bg-surface')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{tr(v.title)}</span>
                  <span className={clsx('block truncate text-[11px]', selected === v.id ? 'text-white/70' : 'text-muted')}>
                    {v.visaLabel} · {n ? t('docsIntel.admin.own', { count: n }) : t('docsIntel.admin.usesGlobal')}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-5">
          {selected === GLOBAL ? (
            globalCount === 0 ? (
              <Panel>
                <EmptyState icon={Sparkles} title={t('docsIntel.admin.global')}>
                  {t('docsIntel.admin.seedHint')}
                  {canEdit && (
                    <button type="button" className="btn-primary btn-sm mt-4" onClick={seed} disabled={!!busy}>
                      {busy === 'seed' ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" aria-hidden />} {t('docsIntel.admin.seedDefaults')}
                    </button>
                  )}
                </EmptyState>
              </Panel>
            ) : (
              <p className="text-sm text-muted">{t('docsIntel.admin.globalHint')}</p>
            )
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-900">
                  {selectedVisa ? tr(selectedVisa.title) : ''} <span className="badge ml-1 bg-navy-900 text-white">{selectedVisa?.visaLabel}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{selectedCount ? t('docsIntel.admin.copyDefaultsHint') : t('docsIntel.admin.emptyVisa')}</p>
              </div>
              {canEdit && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => (selectedCount ? setReplace(true) : copy(false))} disabled={!!busy}>
                  {busy === 'copy' ? <Spinner className="size-3.5" /> : <Copy className="size-3.5" aria-hidden />} {t('docsIntel.admin.copyDefaults')}
                </button>
              )}
            </div>
          )}

          {(selected !== GLOBAL || globalCount > 0) &&
            STAGES.map((stage) => (
              <StageList key={`${selected}-${stage}`} stage={stage} items={lists[stage]} visaCategoryId={selected === GLOBAL ? null : selected} keys={q.data!.keys} canEdit={canEdit} onChanged={refresh} />
            ))}
        </div>
      </div>

      <ConfirmDialog
        open={replace}
        onClose={() => setReplace(false)}
        onConfirm={() => copy(true)}
        loading={busy === 'copy'}
        title={t('docsIntel.admin.replaceTitle')}
        message={t('docsIntel.admin.replaceMsg', { count: selectedCount })}
        confirmLabel={t('docsIntel.admin.replace')}
      />
    </div>
  );
}

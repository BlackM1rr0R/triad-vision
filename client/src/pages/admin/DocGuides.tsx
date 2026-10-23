import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, BookOpen, Eye, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { ImageField } from '@/components/admin/ImageField';
import { LANGS, type Lang } from '@/components/admin/L10nInput';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { GUIDE_FIELDS, GUIDES_KEY, type AdminGuide, type GuideLink, type GuideText } from '@/components/clientData/api';
import { GuideView } from '@/components/clientData/DocGuideButton';

/**
 * Admin → "Sənəd bələdçiləri": the "Necə almalı?" guide of every requirement key in 4 languages, sample image,
 * links, verified / published. Built-in texts are drafts ("please verify") until an admin saves them as verified.
 */

interface Row {
  key: string;
  alias: string | null;
  guide: AdminGuide | null;
}

const emptyText = (): GuideText => Object.fromEntries(GUIDE_FIELDS.map((f) => [f, ''])) as GuideText;
const emptyGuide = (key: string): AdminGuide => ({ key, content: { az: emptyText(), de: emptyText(), en: emptyText(), ru: emptyText() }, links: [], sampleImage: null, verified: false, published: true, builtIn: false, hasDefault: false, updatedAt: null });

export default function DocGuidesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: GUIDES_KEY, queryFn: async () => (await api.get<{ guides: Row[] }>('/admin/doc-guides')).data.guides });
  const [key, setKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminGuide | null>(null);
  const [lang, setLang] = useState<Lang>('az');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');

  const row = data?.find((r) => r.key === key) ?? null;
  useEffect(() => {
    if (!key && data?.length) setKey(data.find((r) => r.guide)?.key ?? data[0].key);
  }, [data, key]);
  useEffect(() => {
    if (key) setDraft(row?.guide ? JSON.parse(JSON.stringify(row.guide)) : emptyGuide(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, row?.guide?.updatedAt, row?.guide?.builtIn]);

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const setText = (f: keyof GuideText, v: string) => setDraft((d) => (d ? { ...d, content: { ...d.content, [lang]: { ...d.content[lang], [f]: v } } } : d));
  const setLinks = (links: GuideLink[]) => setDraft((d) => (d ? { ...d, links } : d));

  const save = async () => {
    if (!draft || !key) return;
    setBusy(true);
    try {
      await api.put(`/admin/doc-guides/${key}`, { content: draft.content, links: draft.links.filter((l) => l.label.trim() && l.url.trim()), sampleImage: draft.sampleImage || null, verified: draft.verified, published: draft.published });
      await qc.invalidateQueries({ queryKey: GUIDES_KEY });
      void qc.invalidateQueries({ queryKey: ['client-guide'] });
      toast.success(t('clientData.guides.saved'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!key) return;
    setBusy(true);
    try {
      await api.delete(`/admin/doc-guides/${key}`);
      await qc.invalidateQueries({ queryKey: GUIDES_KEY });
      toast.success(t('clientData.guides.resetDone'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const status = (g: AdminGuide | null) =>
    !g ? (
      <span className="badge bg-neutral-bg text-[10px] text-neutral-fg">{t('clientData.guides.none')}</span>
    ) : g.builtIn || !g.verified ? (
      <span className="badge bg-warning-bg text-[10px] text-warning-fg">{t('clientData.guides.draft')}</span>
    ) : (
      <span className="badge bg-success-bg text-[10px] text-success-fg">{t('clientData.guides.verified')}</span>
    );

  return (
    <div>
      <PageHead title={t('clientData.guides.title')} subtitle={t('clientData.guides.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Panel title={t('clientData.guides.keys')} icon={BookOpen} bodyClassName="p-2">
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
            {data.map((r) => (
              <li key={r.key}>
                <button type="button" onClick={() => { setKey(r.key); setPreview(false); }} className={clsx('flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition', key === r.key ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950/40 dark:text-brand-200' : 'text-ink hover:bg-surface')}>
                  <span className="min-w-0 truncate font-mono">{r.key}</span>
                  {r.alias && !r.guide ? <span className="text-[10px] text-muted">→ {r.alias}</span> : status(r.guide)}
                </button>
              </li>
            ))}
          </ul>
          {canEdit && (
            <form
              className="mt-2 flex gap-1 border-t border-line p-2"
              onSubmit={(e) => {
                e.preventDefault();
                const k = newKey.trim().toUpperCase();
                if (/^[A-Z][A-Z0-9_]{1,39}$/.test(k)) {
                  setKey(k);
                  setNewKey('');
                }
              }}
            >
              <input className="input min-w-0 flex-1 py-1.5 font-mono text-xs" placeholder="POLICE_CERT" value={newKey} onChange={(e) => setNewKey(e.target.value)} aria-label={t('clientData.guides.newKey')} />
              <button type="submit" className="btn-secondary btn-sm" aria-label={t('clientData.guides.newKey')}>
                <Plus className="size-3.5" aria-hidden />
              </button>
            </form>
          )}
        </Panel>

        {!draft || !key ? (
          <Panel>
            <EmptyState icon={BookOpen} title={t('clientData.guides.pick')} />
          </Panel>
        ) : (
          <Panel
            title={<span className="font-mono">{key}</span>}
            icon={BookOpen}
            actions={
              <>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setPreview((v) => !v)}>
                  {preview ? <Pencil className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />} {preview ? t('clientData.common.edit') : t('clientData.common.preview')}
                </button>
                {canEdit && row?.guide && !row.guide.builtIn && (
                  <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void reset()}>
                    <RotateCcw className="size-3.5" aria-hidden /> {row.guide.hasDefault ? t('clientData.guides.reset') : t('clientData.common.delete')}
                  </button>
                )}
                {canEdit && (
                  <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
                    {busy ? <Spinner className="size-3.5" /> : <Save className="size-3.5" aria-hidden />} {t('clientData.common.save')}
                  </button>
                )}
              </>
            }
          >
            {(draft.builtIn || !draft.verified) && (
              <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('clientData.guides.draftHint')}
              </p>
            )}
            <Tabs className="mb-4" variant="pills" label={t('clientData.guides.title')} items={LANGS.map((l) => ({ key: l, label: <span className="uppercase">{l}</span> }))} value={lang} onChange={setLang} />
            {preview ? (
              <div className="mx-auto max-w-lg rounded-xl border border-line p-4">
                <GuideView guide={{ text: draft.content[lang], links: draft.links, sampleImage: draft.sampleImage, verified: draft.verified }} />
              </div>
            ) : (
              <fieldset disabled={!canEdit} className="space-y-4">
                {GUIDE_FIELDS.map((f) => (
                  <label key={f} className="block text-xs font-semibold text-ink/80">
                    {t(`clientData.guide.${f}`)}
                    {f === 'mistakes' && <span className="font-normal text-muted"> · {t('clientData.guides.onePerLine')}</span>}
                    <textarea className="input mt-1 w-full" rows={f === 'summary' || f === 'cost' || f === 'duration' ? 2 : 3} maxLength={3000} value={draft.content[lang][f]} onChange={(e) => setText(f, e.target.value)} />
                    {f === 'cost' && <span className="mt-1 block font-normal text-amber-700 dark:text-amber-300">{t('clientData.guides.costHint')}</span>}
                  </label>
                ))}
                <ImageField label={t('clientData.guide.sample')} value={draft.sampleImage ?? ''} onChange={(url) => setDraft({ ...draft, sampleImage: url || null })} />
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-ink/80">{t('clientData.guide.links')}</p>
                  {draft.links.map((l, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]">
                      <input className="input" placeholder={t('clientData.guides.linkLabel')} value={l.label} maxLength={120} onChange={(e) => setLinks(draft.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                      <input className="input" type="url" placeholder="https://" value={l.url} maxLength={500} onChange={(e) => setLinks(draft.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                      <button type="button" className="grid size-10 place-items-center rounded-md text-muted hover:text-red-600" aria-label={t('clientData.common.remove')} onClick={() => setLinks(draft.links.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                  {draft.links.length < 10 && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setLinks([...draft.links, { label: '', url: '' }])}>
                      <Plus className="size-3.5" aria-hidden /> {t('clientData.guides.addLink')}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink/80">
                    <Switch checked={draft.verified} onChange={(v) => setDraft({ ...draft, verified: v })} label={t('clientData.guides.verifiedSwitch')} disabled={!canEdit} />
                    {t('clientData.guides.verifiedSwitch')}
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink/80">
                    <Switch checked={draft.published} onChange={(v) => setDraft({ ...draft, published: v })} label={t('clientData.guides.published')} disabled={!canEdit} />
                    {t('clientData.guides.published')}
                  </label>
                </div>
                {draft.updatedAt && <p className="text-[11px] text-muted">{t('clientData.guides.updated', { date: fmtDateTime(draft.updatedAt) })}</p>}
              </fieldset>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

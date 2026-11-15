import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ExternalLink, Megaphone, Pencil, Plus, Send, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStaffTools } from '@/i18n/pagesStaffTools';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate, fmtDateTime, toastError } from '@/components/admin/labels';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { TONE_CLASS } from '@/components/ui/status';

registerCopy(pagesStaffTools);

const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
const LANGS = ['az', 'ru', 'en', 'de'] as const;
type Lang = (typeof LANGS)[number];
type Texts = Partial<Record<Lang, string>>;

// /api/admin/rule-changes (server lib/ruleChanges/service.ts)
interface RuleChange {
  id: string;
  title: Texts;
  body: Texts;
  visaTypes: string[];
  effectiveDate: string | null;
  sourceUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  createdAt: string;
  publishedAt: string | null;
  recipientCount: number;
  emailCount: number;
}

interface Draft {
  id: string | null;
  title: Texts;
  body: Texts;
  visaTypes: string[];
  effectiveDate: string;
  sourceUrl: string;
}
const EMPTY: Draft = { id: null, title: {}, body: {}, visaTypes: [], effectiveDate: '', sourceUrl: '' };

const clean = (v: Texts) => Object.fromEntries(Object.entries(v).filter(([, s]) => s && s.trim())) as Texts;

/** /admin/rule-changes — write a rule change (az required), preview the affected clients, publish (ADMIN+), history. */
export default function AdminRuleChanges() {
  const { t } = useTranslation();
  const r = (k: string, o?: Record<string, unknown>) => String(t(`staffTools.rc.${k}`, o));
  usePageTitle(r('title'));
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin-rule-changes'], queryFn: async () => (await api.get<{ items: RuleChange[] }>('/admin/rule-changes')).data.items });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lang, setLang] = useState<Lang>('az');
  const [publishing, setPublishing] = useState<RuleChange | null>(null);
  const [deleting, setDeleting] = useState<RuleChange | null>(null);

  const preview = useQuery({
    queryKey: ['admin-rule-changes-preview', [...(draft?.visaTypes ?? [])].sort().join(',')],
    enabled: !!draft?.visaTypes.length,
    queryFn: async () => (await api.get<{ count: number; email: number }>('/admin/rule-changes/preview', { params: { visaTypes: draft!.visaTypes.join(',') } })).data,
  });
  const publishPreview = useQuery({
    queryKey: ['admin-rule-changes-preview', [...(publishing?.visaTypes ?? [])].sort().join(',')],
    enabled: !!publishing,
    queryFn: async () => (await api.get<{ count: number; email: number }>('/admin/rule-changes/preview', { params: { visaTypes: publishing!.visaTypes.join(',') } })).data,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin-rule-changes'] });
  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { title: clean(d.title), body: clean(d.body), visaTypes: d.visaTypes, effectiveDate: d.effectiveDate || null, sourceUrl: d.sourceUrl.trim() || null };
      return d.id ? api.put(`/admin/rule-changes/${d.id}`, body) : api.post('/admin/rule-changes', body);
    },
    onSuccess: () => {
      toast.success(r('saved'));
      setDraft(null);
      refresh();
    },
    onError: (e) => toastError(e),
  });
  const publish = useMutation({
    mutationFn: async (id: string) => (await api.post<{ item: RuleChange }>(`/admin/rule-changes/${id}/publish`, {})).data.item,
    onSuccess: (item) => {
      toast.success(r('published', { count: item.recipientCount }));
      setPublishing(null);
      refresh();
    },
    onError: (e) => toastError(e),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/rule-changes/${id}`),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
    onError: (e) => toastError(e),
  });

  const canSave = !!draft && !!draft.title.az?.trim() && !!draft.body.az?.trim() && draft.visaTypes.length > 0;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="stack-page">
      <PageHead
        title={r('title')}
        subtitle={r('subtitle')}
        actions={
          !draft && (
            <button type="button" className="btn-primary btn-sm" onClick={() => (setDraft(EMPTY), setLang('az'))}>
              <Plus className="size-4" aria-hidden /> {r('new')}
            </button>
          )
        }
      />
      {draft && (
        <Panel title={draft.id ? r('editTitle') : r('new')} icon={Megaphone}>
          <form
            className="space-y-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (canSave) save.mutate(draft);
            }}
          >
            <div role="tablist" aria-label={r('titleLabel')} className="flex flex-wrap gap-1.5">
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={lang === l}
                  className={clsx('rounded-lg border px-3 py-1.5 text-xs font-semibold', lang === l ? 'border-brand-500 bg-brand-50 text-ink dark:bg-brand-900/30' : 'border-line text-muted')}
                  onClick={() => setLang(l)}
                >
                  {r(`langs.${l}`)}
                  {l === 'az' ? ' *' : ''}
                  {draft.title[l]?.trim() && draft.body[l]?.trim() ? ' ✓' : ''}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{r('azRequired')}</p>
            <label className="block">
              <span className="label">
                {r('titleLabel')} ({r(`langs.${lang}`)})
              </span>
              <input className="input" maxLength={200} required={lang === 'az'} value={draft.title[lang] ?? ''} onChange={(e) => set({ title: { ...draft.title, [lang]: e.target.value } })} />
            </label>
            <label className="block">
              <span className="label">
                {r('bodyLabel')} ({r(`langs.${lang}`)})
              </span>
              <textarea className="input min-h-36" maxLength={5000} required={lang === 'az'} value={draft.body[lang] ?? ''} onChange={(e) => set({ body: { ...draft.body, [lang]: e.target.value } })} />
            </label>
            <fieldset>
              <legend className="label">{r('visaTypes')}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {VISA_TYPES.map((v) => (
                  <label key={v} className="flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.visaTypes.includes(v)}
                      onChange={(e) => set({ visaTypes: e.target.checked ? [...draft.visaTypes, v] : draft.visaTypes.filter((x) => x !== v) })}
                    />
                    {t(`staffTools.visa.${v}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">{r('effectiveDate')}</span>
                <input type="date" className="input" value={draft.effectiveDate} onChange={(e) => set({ effectiveDate: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">{r('sourceUrl')}</span>
                <input type="url" inputMode="url" pattern="https://.*" className="input" maxLength={500} value={draft.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} />
                <span className="mt-1 block text-[11px] text-muted">{r('sourceHint')}</span>
              </label>
            </div>
            {draft.visaTypes.length > 0 && preview.data && (
              <p className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-sm text-ink" role="status">
                <Users className="size-4" aria-hidden /> {r('preview', { count: preview.data.count, email: preview.data.email })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary btn-sm" disabled={!canSave || save.isPending}>
                {r('save')}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setDraft(null)}>
                {r('cancel')}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title={r('history')} icon={Megaphone}>
        {!isAdmin && <p className="mb-3 text-xs text-muted">{r('adminOnly')}</p>}
        {list.isLoading ? (
          <LoadingBlock />
        ) : list.error ? (
          <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.length ? (
          <EmptyState icon={Megaphone} title={r('empty')} />
        ) : (
          <ul className="divide-y divide-line">
            {list.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    <span className={clsx('badge', TONE_CLASS[c.status === 'PUBLISHED' ? 'success' : 'neutral'])}>{c.status === 'PUBLISHED' ? r('sent') : r('draft')}</span>
                    {c.title.az}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {c.visaTypes.map((v) => t(`staffTools.visa.${v}`, { defaultValue: v })).join(', ')}
                    {c.effectiveDate ? ` · ${r('effectiveDate')}: ${fmtDate(c.effectiveDate)}` : ''}
                    {c.publishedAt ? ` · ${fmtDateTime(c.publishedAt)} · ${r('recipients', { count: c.recipientCount, email: c.emailCount })}` : ''}
                  </p>
                  {c.sourceUrl && (
                    <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-link hover:underline">
                      <ExternalLink className="size-3" aria-hidden /> {new URL(c.sourceUrl).hostname}
                    </a>
                  )}
                </div>
                {c.status === 'DRAFT' && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => (
                        setDraft({ id: c.id, title: c.title, body: c.body, visaTypes: c.visaTypes, effectiveDate: c.effectiveDate ? c.effectiveDate.slice(0, 10) : '', sourceUrl: c.sourceUrl ?? '' }), setLang('az')
                      )}
                    >
                      <Pencil className="size-3.5" aria-hidden /> {r('edit')}
                    </button>
                    {isAdmin && (
                      <button type="button" className="btn-primary btn-sm" onClick={() => setPublishing(c)}>
                        <Send className="size-3.5" aria-hidden /> {r('publish')}
                      </button>
                    )}
                    <button type="button" className="btn-ghost btn-sm text-danger-fg" aria-label={r('delete')} onClick={() => setDeleting(c)}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={!!publishing}
        onClose={() => setPublishing(null)}
        onConfirm={() => publishing && publish.mutate(publishing.id)}
        title={r('publish')}
        message={r('publishConfirm', { count: publishPreview.data?.count ?? '…' })}
        confirmLabel={r('publish')}
        tone="primary"
        loading={publish.isPending}
      />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} title={r('delete')} message={r('deleteConfirm')} loading={remove.isPending} />
    </div>
  );
}

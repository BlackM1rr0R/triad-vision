import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Braces, Eye, RotateCcw, Save } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesExternalApps } from '@/i18n/pagesExternalApps';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorBlock, ListSkeleton, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { Button } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/ConfirmHost';
import { xappError, type CoverJobType } from '@/components/germanyJobs/externalApps';

registerCopy(pagesExternalApps);

interface Template {
  jobType: CoverJobType;
  name: string;
  subject: string;
  body: string;
  custom: boolean;
  updatedAt: string | null;
}
interface Placeholder {
  key: string;
  de: string;
  example: string;
}

const KEY = ['admin-cover-letter-templates'];

/**
 * Admin → Anschreiben-Vorlagen (ADMIN+): one German template per job type with the placeholder list, a preview
 * with sample data and "restore built-in". Server: routes/admin/coverLetterTemplates.ts. No AI.
 */
export default function AdminCoverLetterTemplates() {
  const { t } = useTranslation();
  usePageTitle(t('xapp.templates.title'));
  const uid = useId();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ items: Template[]; placeholders: Placeholder[] }>('/admin/cover-letter-templates')).data });
  const [selected, setSelected] = useState<CoverJobType>('GENERAL');
  const [form, setForm] = useState({ name: '', subject: '', body: '' });
  const [preview, setPreview] = useState<{ subject: string; body: string; unknown: string[] } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const current = q.data?.items.find((x) => x.jobType === selected) ?? null;

  useEffect(() => {
    if (current) setForm({ name: current.name, subject: current.subject, body: current.body });
    setPreview(null);
  }, [current?.jobType, current?.updatedAt, current?.custom]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSaved = (items: Template[]) => qc.setQueryData(KEY, (old: { items: Template[]; placeholders: Placeholder[] } | undefined) => (old ? { ...old, items } : old));
  const save = useMutation({
    mutationFn: async () => (await api.put<{ items: Template[] }>(`/admin/cover-letter-templates/${selected}`, form)).data.items,
    onSuccess: (items) => {
      onSaved(items);
      toast.success(t('xapp.templates.saved'));
    },
    onError: (err) => toast.error(xappError(err)),
  });
  const reset = useMutation({
    mutationFn: async () => (await api.delete<{ items: Template[] }>(`/admin/cover-letter-templates/${selected}`)).data.items,
    onSuccess: (items) => {
      onSaved(items);
      toast.success(t('xapp.templates.resetDone'));
    },
    onError: (err) => toast.error(xappError(err)),
  });
  const runPreview = useMutation({
    mutationFn: async () => (await api.post<{ subject: string; body: string; unknown: string[] }>('/admin/cover-letter-templates/preview', { subject: form.subject, body: form.body })).data,
    onSuccess: setPreview,
    onError: (err) => toast.error(xappError(err)),
  });

  const insert = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return setForm((f) => ({ ...f, body: `${f.body}${token}` }));
    const start = el.selectionStart ?? form.body.length;
    const end = el.selectionEnd ?? start;
    const body = `${form.body.slice(0, start)}${token}${form.body.slice(end)}`;
    setForm((f) => ({ ...f, body }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  if (q.isLoading) return <ListSkeleton rows={6} cols={2} />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const dirty = !!current && (form.name !== current.name || form.subject !== current.subject || form.body !== current.body);

  return (
    <div className="space-y-5">
      <PageHead title={t('xapp.templates.title')} subtitle={t('xapp.templates.intro')} />
      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label={t('xapp.templates.title')}>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {q.data.items.map((tp) => (
              <li key={tp.jobType} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSelected(tp.jobType)}
                  aria-current={tp.jobType === selected ? 'true' : undefined}
                  className={clsx(
                    'flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left text-sm',
                    tp.jobType === selected ? 'border-brand-400 bg-card font-semibold text-ink' : 'border-line bg-card/60 text-ink/80 hover:border-brand-300',
                  )}
                >
                  <span>{t(`xapp.letter.jobTypes.${tp.jobType}`)}</span>
                  <span className={clsx('text-[11px] font-normal', tp.custom ? 'text-success-fg' : 'text-muted')}>{tp.custom ? t('xapp.templates.custom') : t('xapp.templates.builtIn')}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          <Panel
            title={current ? `${t(`xapp.letter.jobTypes.${current.jobType}`)}${current.custom && current.updatedAt ? ` · ${t('xapp.templates.updated', { date: fmtDate(current.updatedAt) })}` : ''}` : ''}
            actions={
              current?.custom ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={RotateCcw}
                  loading={reset.isPending}
                  onClick={async () => {
                    if (await confirmDialog({ message: t('xapp.templates.resetConfirm') })) reset.mutate();
                  }}
                >
                  {t('xapp.templates.reset')}
                </Button>
              ) : undefined
            }
          >
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`${uid}-name`}>
                    {t('xapp.templates.name')}
                  </label>
                  <input id={`${uid}-name`} className="input" required maxLength={120} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label" htmlFor={`${uid}-subject`}>
                    {t('xapp.templates.subject')}
                  </label>
                  <input id={`${uid}-subject`} className="input" required maxLength={300} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} lang="de" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-body`}>
                  {t('xapp.templates.body')}
                </label>
                <textarea
                  ref={bodyRef}
                  id={`${uid}-body`}
                  className="input min-h-[24rem] resize-y font-mono text-[13px] leading-relaxed"
                  required
                  minLength={20}
                  maxLength={12_000}
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  lang="de"
                  spellCheck
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" icon={Save} loading={save.isPending} disabled={!dirty}>
                  {t('xapp.templates.save')}
                </Button>
                <Button variant="secondary" icon={Eye} loading={runPreview.isPending} onClick={() => runPreview.mutate()}>
                  {t('xapp.templates.preview')}
                </Button>
              </div>
            </form>
          </Panel>

          {preview && (
            <Panel title={t('xapp.templates.preview')} icon={Eye}>
              {preview.unknown.length > 0 && (
                <p className="mb-3 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg">
                  {t('xapp.templates.unknown', { list: preview.unknown.map((k) => `{{${k}}}`).join(', '), interpolation: { escapeValue: false } })}
                </p>
              )}
              <p className="font-semibold text-ink" lang="de">
                {preview.subject}
              </p>
              <p className="mt-3 text-sm whitespace-pre-line text-ink" lang="de">
                {preview.body}
              </p>
            </Panel>
          )}

          <Panel title={t('xapp.templates.placeholders')} icon={Braces}>
            <p className="mb-3 text-xs text-muted">{t('xapp.templates.placeholdersHint', { example: '{{name}}', interpolation: { escapeValue: false } })}</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {q.data.placeholders.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => insert(p.key)}
                    className="flex w-full flex-col items-start rounded-md border border-line px-2.5 py-1.5 text-left hover:border-brand-400"
                    aria-label={t('xapp.templates.insert', { key: `{{${p.key}}}`, interpolation: { escapeValue: false } })}
                  >
                    <code className="text-xs font-semibold text-ink">{`{{${p.key}}}`}</code>
                    <span className="text-[11px] text-muted" lang="de">
                      {p.de} — {p.example}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

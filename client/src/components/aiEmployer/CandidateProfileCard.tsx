import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ChevronUp, Eye, FileDown, Plus, RefreshCw, Save, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { downloadBlob, filenameFrom } from '@/components/cv/types';
import { AiWorking, UnavailableNote, aiErrorText, costText, useAiStatus } from './shared';

/**
 * "Generate profile for employer": one click drafts a German (or English) candidate profile from anonymised data,
 * shown as an editable card with Regenerate / Save / Download PDF / Propose to employer. Staff only.
 */

export type ProfileLang = 'de' | 'en';

export interface ProfileContent {
  headline: string;
  summary: string;
  experience: { role: string; years: number | null; tasks: string[] }[];
  languages: { language: string; level: string }[];
  licences: string[];
  education: string;
  availability: string;
  whyFit: string[];
  openPoints: string[];
}

interface SavedProfile {
  id: string;
  applicationId: string | null;
  language: ProfileLang;
  content: ProfileContent | null;
  model: string | null;
  costUsd: number;
  sharedAt: string | null;
  updatedAt: string;
}

/** Editable form: list fields are kept as text (one item per line) while typing. */
interface Form {
  headline: string;
  summary: string;
  experience: { role: string; years: string; tasks: string }[];
  languages: { language: string; level: string }[];
  licences: string;
  education: string;
  availability: string;
  whyFit: string;
  openPoints: string;
}

const toForm = (c: ProfileContent): Form => ({
  headline: c.headline,
  summary: c.summary,
  experience: c.experience.map((e) => ({ role: e.role, years: e.years != null ? String(e.years) : '', tasks: e.tasks.join('\n') })),
  languages: c.languages.map((l) => ({ ...l })),
  licences: c.licences.join(', '),
  education: c.education,
  availability: c.availability,
  whyFit: c.whyFit.join('\n'),
  openPoints: c.openPoints.join('\n'),
});

const lines = (s: string, max: number, len: number) =>
  s
    .split('\n')
    .map((x) => x.trim().slice(0, len))
    .filter(Boolean)
    .slice(0, max);

const fromForm = (f: Form): ProfileContent => ({
  headline: f.headline.trim().slice(0, 160),
  summary: f.summary.trim().slice(0, 1500),
  experience: f.experience
    .filter((e) => e.role.trim())
    .slice(0, 10)
    .map((e) => {
      const y = Number.parseFloat(e.years.replace(',', '.'));
      return { role: e.role.trim().slice(0, 120), years: Number.isFinite(y) && y >= 0 && y <= 60 ? y : null, tasks: lines(e.tasks, 8, 240) };
    }),
  languages: f.languages
    .filter((l) => l.language.trim())
    .slice(0, 10)
    .map((l) => ({ language: l.language.trim().slice(0, 60), level: l.level.trim().slice(0, 40) })),
  licences: f.licences
    .split(/[,;\s]+/)
    .map((x) => x.trim().toUpperCase().slice(0, 12))
    .filter(Boolean)
    .slice(0, 16),
  education: f.education.trim().slice(0, 400),
  availability: f.availability.trim().slice(0, 300),
  whyFit: lines(f.whyFit, 8, 300),
  openPoints: lines(f.openPoints, 8, 300),
});

const Field = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <label className={clsx('block min-w-0', className)}>
    <span className="label">{label}</span>
    {children}
  </label>
);

export const CandidateProfileCard = ({
  userId,
  applicationId,
  vacancyId,
  canPropose = true,
  onChanged,
}: {
  userId: string;
  applicationId?: string;
  vacancyId?: string;
  /** false when the application cannot be shown to an employer (withdrawn, vacancy without employer …). */
  canPropose?: boolean;
  onChanged?: () => void;
}) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const status = useAiStatus('staff');
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<ProfileLang>('de');
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [meta, setMeta] = useState<{ model: string | null; costUsd: number }>({ model: null, costUsd: 0 });
  const [busy, setBusy] = useState<null | 'generate' | 'save' | 'propose' | 'pdf'>(null);
  const target = applicationId ? { applicationId } : { userId, ...(vacancyId ? { vacancyId } : {}) };
  const key = ['ai-employer-profile', applicationId ?? `${userId}:${vacancyId ?? ''}`];

  const saved = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ profile: SavedProfile | null; name: string; applicationStatus: string | null }>('/admin/ai/employer/profile', { params: target })).data,
    enabled: open,
  });
  const profile = saved.data?.profile ?? null;
  const aiOff = status.data ? !status.data.available : false;

  const generate = async (language = lang) => {
    setBusy('generate');
    try {
      const r = (await api.post<{ draft: { content: ProfileContent; language: ProfileLang; model: string; costUsd: number } }>('/admin/ai/employer/profile/generate', { ...target, language })).data;
      setForm(toForm(r.draft.content));
      setMeta({ model: r.draft.model, costUsd: r.draft.costUsd });
      setLang(language);
      setDirty(true);
    } catch (err) {
      toast.error(aiErrorText(t, err));
    } finally {
      setBusy(null);
    }
  };

  const openCard = async () => {
    setOpen(true);
    if (form) return;
    const r = await qc.fetchQuery({ queryKey: key, queryFn: async () => (await api.get<{ profile: SavedProfile | null; name: string; applicationStatus: string | null }>('/admin/ai/employer/profile', { params: target })).data });
    if (r.profile?.content) {
      setForm(toForm(r.profile.content));
      setLang(r.profile.language);
      setMeta({ model: r.profile.model, costUsd: r.profile.costUsd });
    } else if (!aiOff) void generate();
  };

  const body = () => ({ ...target, language: lang, content: fromForm(form!), model: meta.model, costUsd: meta.costUsd });

  const save = async () => {
    setBusy('save');
    try {
      const r = (await api.put<{ profile: SavedProfile }>('/admin/ai/employer/profile', body())).data;
      qc.setQueryData(key, (old: object | undefined) => ({ ...(old ?? {}), profile: r.profile }));
      setDirty(false);
      toast.success(t('aiEmployer.profile.saved'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const propose = async () => {
    if (!applicationId) return;
    setBusy('propose');
    try {
      const r = (await api.post<{ profile: SavedProfile; needsStatusChange: boolean }>('/admin/ai/employer/profile/propose', body())).data;
      qc.setQueryData(key, (old: object | undefined) => ({ ...(old ?? {}), profile: r.profile }));
      setDirty(false);
      // The existing status endpoint moves the application to PROPOSED (notifications, audit, webhooks).
      if (r.needsStatusChange) await api.patch(`/admin/candidates/applications/${applicationId}`, { status: 'PROPOSED' });
      toast.success(t('aiEmployer.profile.proposed'));
      onChanged?.();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const pdf = async () => {
    setBusy('pdf');
    try {
      const res = await api.post<Blob>('/admin/ai/employer/profile/pdf', { ...target, language: lang, content: fromForm(form!) }, { responseType: 'blob' });
      downloadBlob(res.data, filenameFrom(res.headers['content-disposition'] as string | undefined, 'Kandidatenprofil.pdf'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setDirty(true);
  };
  const setExp = (i: number, patch: Partial<Form['experience'][number]>) => set('experience', form!.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const setLangRow = (i: number, patch: Partial<Form['languages'][number]>) => set('languages', form!.languages.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  if (!open) {
    return (
      <div className="space-y-1">
        <button type="button" className="btn-secondary btn-sm" onClick={() => void openCard()} disabled={status.isLoading}>
          <Sparkles className="size-3.5 text-brand-600" /> {t('aiEmployer.profile.button')}
        </button>
        <UnavailableNote status={status.data} />
      </div>
    );
  }

  const valid = !!form && !!form.headline.trim() && !!form.summary.trim();
  const cost = costText(t, meta.costUsd);

  return (
    <section className="rounded-xl border border-line bg-white p-4" aria-label={t('aiEmployer.profile.title')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
          <Sparkles className="size-4 text-brand-600" aria-hidden /> {t('aiEmployer.profile.title')}
        </p>
        <div className="flex items-center gap-2">
          {profile?.sharedAt && (
            <span className="badge bg-success-bg text-success-fg">
              <Eye className="size-3" aria-hidden /> {t('aiEmployer.profile.shared')}
            </span>
          )}
          <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface" onClick={() => setOpen(false)} aria-label={t('aiEmployer.common.close')}>
            <ChevronUp className="size-4" />
          </button>
        </div>
      </div>

      <p className="mb-3 flex items-start gap-1.5 text-[11px] text-muted">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-brand-600" aria-hidden /> {t('aiEmployer.profile.anonNote')}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink/80">{t('aiEmployer.profile.language')}:</span>
        {(['de', 'en'] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            disabled={!!busy || aiOff}
            onClick={() => (l !== lang ? void generate(l) : undefined)}
            className={clsx(
              'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition disabled:opacity-60',
              lang === l ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400',
            )}
          >
            {l === 'de' ? t('aiEmployer.profile.langDe') : t('aiEmployer.profile.langEn')}
          </button>
        ))}
      </div>

      {busy === 'generate' || (saved.isLoading && !form) ? (
        <AiWorking lines={6} />
      ) : !form ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">{t('aiEmployer.profile.empty')}</p>
          <button type="button" className="btn-primary btn-sm" onClick={() => void generate()} disabled={aiOff}>
            <Sparkles className="size-3.5" /> {t('aiEmployer.profile.generate')}
          </button>
          <UnavailableNote status={status.data} />
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={t('aiEmployer.profile.fields.headline')}>
            <input className="input" maxLength={160} value={form.headline} onChange={(e) => set('headline', e.target.value)} />
          </Field>
          <Field label={t('aiEmployer.profile.fields.summary')}>
            <textarea className="input min-h-24" maxLength={1500} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
          </Field>

          <div>
            <p className="label">{t('aiEmployer.profile.fields.experience')}</p>
            <ul className="space-y-2">
              {form.experience.map((e, i) => (
                <li key={i} className="space-y-2 rounded-lg bg-surface p-2.5">
                  <div className="grid grid-cols-[1fr_5rem_auto] gap-2">
                    <input aria-label={t('aiEmployer.profile.fields.role')} placeholder={t('aiEmployer.profile.fields.role')} className="input py-1.5" maxLength={120} value={e.role} onChange={(ev) => setExp(i, { role: ev.target.value })} />
                    <input aria-label={t('aiEmployer.profile.fields.years')} placeholder={t('aiEmployer.profile.fields.years')} className="input py-1.5" inputMode="decimal" maxLength={4} value={e.years} onChange={(ev) => setExp(i, { years: ev.target.value })} />
                    <button type="button" className="grid size-9 place-items-center rounded-md text-muted hover:text-danger" aria-label={t('aiEmployer.common.remove')} onClick={() => set('experience', form.experience.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <textarea aria-label={t('aiEmployer.profile.fields.tasks')} placeholder={t('aiEmployer.profile.fields.tasks')} className="input min-h-16 py-1.5 text-xs" value={e.tasks} onChange={(ev) => setExp(i, { tasks: ev.target.value })} />
                </li>
              ))}
            </ul>
            {form.experience.length < 10 && (
              <button type="button" className="mt-1.5 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-brand-700" onClick={() => set('experience', [...form.experience, { role: '', years: '', tasks: '' }])}>
                <Plus className="size-3.5" /> {t('aiEmployer.common.add')}
              </button>
            )}
          </div>

          <div>
            <p className="label">{t('aiEmployer.profile.fields.languages')}</p>
            <ul className="space-y-1.5">
              {form.languages.map((l, i) => (
                <li key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2">
                  <input aria-label={t('aiEmployer.profile.fields.language')} className="input py-1.5" maxLength={60} value={l.language} onChange={(ev) => setLangRow(i, { language: ev.target.value })} />
                  <input aria-label={t('aiEmployer.profile.fields.level')} className="input py-1.5" maxLength={40} value={l.level} onChange={(ev) => setLangRow(i, { level: ev.target.value })} />
                  <button type="button" className="grid size-9 place-items-center rounded-md text-muted hover:text-danger" aria-label={t('aiEmployer.common.remove')} onClick={() => set('languages', form.languages.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            {form.languages.length < 10 && (
              <button type="button" className="mt-1.5 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-brand-700" onClick={() => set('languages', [...form.languages, { language: '', level: '' }])}>
                <Plus className="size-3.5" /> {t('aiEmployer.common.add')}
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('aiEmployer.profile.fields.licences')}>
              <input className="input" maxLength={80} value={form.licences} onChange={(e) => set('licences', e.target.value)} />
            </Field>
            <Field label={t('aiEmployer.profile.fields.education')}>
              <input className="input" maxLength={400} value={form.education} onChange={(e) => set('education', e.target.value)} />
            </Field>
          </div>
          <Field label={t('aiEmployer.profile.fields.availability')}>
            <input className="input" maxLength={300} value={form.availability} onChange={(e) => set('availability', e.target.value)} />
          </Field>
          <Field label={t('aiEmployer.profile.fields.whyFit')}>
            <textarea className="input min-h-20" value={form.whyFit} onChange={(e) => set('whyFit', e.target.value)} />
          </Field>
          <Field label={t('aiEmployer.profile.fields.openPoints')}>
            <textarea className="input min-h-16" value={form.openPoints} onChange={(e) => set('openPoints', e.target.value)} />
          </Field>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className="btn-secondary btn-sm" disabled={!!busy || aiOff} onClick={() => void generate()}>
              <RefreshCw className="size-3.5" /> {t('aiEmployer.profile.regenerate')}
            </button>
            <button type="button" className="btn-secondary btn-sm" disabled={!!busy || !valid} onClick={() => void save()}>
              {busy === 'save' ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('aiEmployer.profile.save')}
            </button>
            <button type="button" className="btn-secondary btn-sm" disabled={!!busy || !valid} onClick={() => void pdf()}>
              {busy === 'pdf' ? <Spinner className="size-3.5" /> : <FileDown className="size-3.5" />} {t('aiEmployer.profile.pdf')}
            </button>
            {applicationId && (
              <button type="button" className="btn-primary btn-sm" disabled={!!busy || !valid || !canPropose} onClick={() => void propose()}>
                {busy === 'propose' ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('aiEmployer.profile.propose')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            {dirty && <span className="text-amber-800">{t('aiEmployer.profile.unsaved')}</span>}
            {profile && <span>{t('aiEmployer.profile.savedAt', { date: fmtDateTime(profile.updatedAt) })}</span>}
            {cost && <span>{cost}</span>}
            {!applicationId && <span>{t('aiEmployer.profile.proposeNeedsApp')}</span>}
          </div>
          <UnavailableNote status={status.data} />
        </div>
      )}
    </section>
  );
};

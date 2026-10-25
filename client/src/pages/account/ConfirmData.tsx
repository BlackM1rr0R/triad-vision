import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, Camera, Check, CheckCircle2, Paperclip, Pencil, ShieldCheck } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import type { L10n } from '@/lib/types';
import { PageLoader, Spinner } from '@/components/ui/Spinner';
import { clientTasksKey, uploadCaseFile, type ClientConfirmation, type ConfirmAnswer } from '@/components/clientData/api';
import { Success } from '@/components/illustrations';

type Draft = Record<string, ConfirmAnswer & { proofName?: string }>;

/** /account/cases/:id/confirm — every value that goes to the embassy: "✓ Düzdür" or "✏️ Düzəlt" (+ photo proof). */
export default function ConfirmDataPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { tr, dateTime } = useL10n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ['client-confirmation', id];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ confirmation: ClientConfirmation | null; sections: Record<string, L10n> }>(`/client-data/cases/${id}/confirmation`)).data,
    enabled: !!id,
  });
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  usePageTitle(t('clientData.portal.confirmTitle'));
  const fileRef = useRef<HTMLInputElement>(null);
  const [proofFor, setProofFor] = useState<string | null>(null);

  const conf = data?.confirmation ?? null;
  const sections = useMemo(() => {
    const out: { section: string; fields: ClientConfirmation['fields'] }[] = [];
    for (const f of conf?.fields ?? []) {
      const last = out[out.length - 1];
      if (last?.section === f.section) last.fields.push(f);
      else out.push({ section: f.section, fields: [f] });
    }
    return out;
  }, [conf]);

  if (isLoading) return <PageLoader />;
  if (error || !conf) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-ink">{t('clientData.portal.noConfirmation')}</p>
        <Link to={`/account/cases/${id}`} className="btn-primary mt-6">
          <ArrowLeft className="size-4" aria-hidden /> {t('clientData.common.back')}
        </Link>
      </div>
    );
  }

  const editable = conf.editable;
  const answers: Draft = editable ? draft : (conf.answers as Draft);
  const total = conf.fields.length;
  const done = conf.fields.filter((f) => answers[f.key] && (answers[f.key].ok || answers[f.key].value?.trim())).length;
  const set = (k: string, a: Draft[string]) => setDraft((d) => ({ ...d, [k]: a }));

  const submit = async () => {
    setTried(true);
    if (done < total) {
      toast.error(t('clientData.errors.ANSWER_EVERY_LINE'));
      return;
    }
    setBusy('submit');
    try {
      const body = Object.fromEntries(Object.entries(draft).map(([k, a]) => [k, a.ok ? { ok: true } : { ok: false, value: a.value, proofDocumentId: a.proofDocumentId ?? null }]));
      await api.post(`/client-data/cases/${id}/confirmation/submit`, { answers: body });
      toast.success(t('clientData.portal.confirmSent'));
      await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: clientTasksKey(id) })]);
      navigate(`/account/cases/${id}`);
    } catch (err) {
      toast.error(t(`clientData.errors.${errorCode(err)}`, { defaultValue: t('common.error') }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24 sm:pb-0">
      <Link to={`/account/cases/${id}`} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link hover:text-link">
        <ArrowLeft className="size-4" aria-hidden /> {t('clientData.common.back')}
      </Link>
      <header className="card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-sage">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="type-page-title">{t('clientData.portal.confirmTitle')}</h1>
            <p className="mt-1 text-sm text-muted">{editable ? t('clientData.portal.confirmIntro') : t('clientData.portal.confirmDone', { date: conf.submittedAt ? dateTime(conf.submittedAt) : '' })}</p>
          </div>
          {!editable && <Success className="hidden w-24 shrink-0 sm:block" />}
        </div>
        {editable && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted">
              <span>{t('clientData.portal.progress', { done, total })}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full rounded-full bg-highlight transition-[width]" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,application/pdf"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          const k = proofFor;
          if (!file || !k) return;
          setBusy(`proof:${k}`);
          try {
            const doc = await uploadCaseFile(id, file);
            setDraft((d) => ({ ...d, [k]: { ...(d[k] ?? { ok: false }), ok: false, proofDocumentId: doc.id, proofName: doc.originalName } }));
          } catch {
            toast.error(t('clientData.errors.UPLOAD_FAILED'));
          } finally {
            setBusy(null);
          }
        }}
      />

      {sections.map((s) => (
        <section key={s.section} className="card overflow-hidden">
          <h2 className="border-b border-line bg-sunken px-5 py-3 text-sm font-semibold text-ink">{tr(data?.sections[s.section]) || s.section}</h2>
          <ul className="divide-y divide-line">
            {s.fields.map((f) => {
              const a = answers[f.key];
              const unanswered = tried && !(a && (a.ok || a.value?.trim()));
              return (
                <li key={f.key} className={clsx('px-5 py-4', unanswered && 'bg-danger-bg')}>
                  <p className="text-xs font-semibold text-muted">{tr(f.label)}</p>
                  <p className={clsx('mt-0.5 font-mono text-base break-words text-ink', a && !a.ok && 'line-through opacity-60')}>{f.value || <span className="font-sans text-sm text-muted italic">{t('clientData.portal.emptyValue')}</span>}</p>
                  {editable ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-sm">
                      <button
                        type="button"
                        aria-pressed={a?.ok === true}
                        onClick={() => set(f.key, { ok: true })}
                        className={clsx('inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition', a?.ok === true ? 'border-success bg-success text-white' : 'border-line bg-card text-ink/80 hover:border-success')}
                      >
                        <Check className="size-4" aria-hidden /> {t('clientData.portal.correct')}
                      </button>
                      <button
                        type="button"
                        aria-pressed={a?.ok === false}
                        onClick={() => set(f.key, { ok: false, value: a?.ok === false ? a.value : f.value, proofDocumentId: a?.proofDocumentId, proofName: a?.proofName })}
                        className={clsx('inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition', a?.ok === false ? 'border-warning bg-warning-bg text-warning-fg ring-2 ring-warning/30' : 'border-line bg-card text-ink/80 hover:border-warning')}
                      >
                        <Pencil className="size-4" aria-hidden /> {t('clientData.portal.fix')}
                      </button>
                    </div>
                  ) : (
                    a && (
                      <p className={clsx('mt-2 inline-flex items-center gap-1.5 text-sm font-semibold', a.ok ? 'text-success-fg' : 'text-warning-fg')}>
                        {a.ok ? <CheckCircle2 className="size-4" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
                        {a.ok ? t('clientData.portal.correct') : `${t('clientData.portal.correctedTo')}: ${a.value}`}
                      </p>
                    )
                  )}
                  {editable && a?.ok === false && (
                    <div className="mt-3 space-y-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-ink/80">{t('clientData.portal.correctValue')}</span>
                        <input className="input w-full" value={a.value ?? ''} maxLength={300} onChange={(e) => set(f.key, { ...a, value: e.target.value })} />
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={!!busy}
                          onClick={() => {
                            setProofFor(f.key);
                            fileRef.current?.click();
                          }}
                        >
                          {busy === `proof:${f.key}` ? <Spinner className="size-4" /> : <Camera className="size-4" aria-hidden />} {t('clientData.portal.addProof')}
                        </button>
                        {a.proofName && (
                          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted">
                            <Paperclip className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{a.proofName}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card p-3 sm:static sm:rounded-xl sm:border sm:p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">{t('clientData.portal.evidenceNote')}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-white flex-1 border border-line sm:flex-none" disabled={!!busy} onClick={() => setDraft(Object.fromEntries(conf.fields.map((f) => [f.key, draft[f.key] ?? { ok: true }])))}>
                <Check className="size-4" aria-hidden /> {t('clientData.portal.allCorrect')}
              </button>
              <button type="button" className="btn-primary flex-1 sm:flex-none" disabled={!!busy} onClick={() => void submit()}>
                {busy === 'submit' ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" aria-hidden />} {t('clientData.portal.confirmSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

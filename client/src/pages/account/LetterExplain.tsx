import { useRef, useState, type ReactNode } from 'react';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { compressImage } from '@/lib/imageCompress';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlarmClock, BookOpen, Building2, Camera, CheckCircle2, ExternalLink, FileText, ListChecks, Loader2, MailQuestion, Paperclip, Send, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAiDocs } from '@/i18n/pagesAiDocs';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { aiLimitMessage, errorCode, fetchLetters, lettersKey, type LetterItem } from '@/components/aiDocs/api';
import { EmptyInbox } from '@/components/illustrations';
import { confirmDialog } from '@/components/ui/ConfirmHost';

registerCopy(pagesAiDocs);

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;
const TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
/** Photos are shrunk in the browser before the upload (the AI budget is small; the server cannot resize). */
const MAX_EDGE = 2000;

// Shared helper (lib/imageCompress): photos from 900 KB up, long edge 2000 px, JPEG 0.82.
const downscale = (file: File): Promise<File> => compressImage(file, { maxLongEdge: MAX_EDGE, minBytes: 900 * 1024 });

const daysUntil = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
};

const URGENCY_TONE = toneClasses(STATUS_TONES.urgency);

const Section = ({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children: ReactNode }) => (
  <section>
    <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
      <Icon className="size-3.5" aria-hidden /> {title}
    </h4>
    {children}
  </section>
);

const LetterCard = ({ item, defaultOpen }: { item: LetterItem; defaultOpen?: boolean }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(!!defaultOpen);
  const [note, setNote] = useState('');
  const [askSend, setAskSend] = useState(false);
  const e = item.letter.explanation;
  const err = (x: unknown) => {
    const code = errorCode(x);
    toast.error(t(`aiDocs.letters.errors.${code}`, { defaultValue: t('aiDocs.letters.errors.generic') }));
  };

  const send = useMutation({
    mutationFn: async () => (await api.post<{ caseId: string; item: LetterItem }>(`/ai-docs/letters/${item.id}/send`, { note: note.trim() || undefined })).data,
    onSuccess: (r) => {
      toast.success(t('aiDocs.letters.sent'));
      qc.setQueryData<LetterItem[]>(lettersKey, (list) => list?.map((l) => (l.id === item.id ? r.item : l)));
      setAskSend(false);
    },
    onError: err,
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/ai-docs/letters/${item.id}`),
    onSuccess: () => {
      toast.success(t('aiDocs.letters.deleted'));
      qc.setQueryData<LetterItem[]>(lettersKey, (list) => list?.filter((l) => l.id !== item.id));
    },
    onError: err,
  });

  return (
    <li className="card overflow-hidden">
      <button type="button" className="flex w-full items-start gap-3 p-4 text-left sm:p-5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
          <MailQuestion className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold break-words text-ink">{e.subject ?? item.filename}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {e.sender.name ? `${e.sender.name} · ` : ''}
            {date(item.createdAt)}
          </span>
        </span>
        <span className={clsx('badge shrink-0 whitespace-nowrap', URGENCY_TONE[e.urgency])}>
          {t('aiDocs.letters.urgency.label')}: {t(`aiDocs.letters.urgency.${e.urgency}`)}
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-line px-4 py-5 sm:px-5">
          {e.sender.name && (
            <Section icon={Building2} title={t('aiDocs.letters.sender')}>
              <p className="text-sm text-ink">
                {e.sender.name} <span className="text-muted">· {t(`aiDocs.letters.kind.${e.sender.kind}`)}</span>
              </p>
              {(e.letterDate || e.reference) && (
                <p className="mt-0.5 text-xs text-muted">
                  {e.letterDate && `${t('aiDocs.letters.letterDate')}: ${date(e.letterDate)}`}
                  {e.letterDate && e.reference && ' · '}
                  {e.reference && `${t('aiDocs.letters.reference')}: ${e.reference}`}
                </p>
              )}
            </Section>
          )}
          <Section icon={FileText} title={t('aiDocs.letters.about')}>
            <p className="text-sm leading-relaxed text-ink">{e.summary}</p>
          </Section>
          {e.deadlines.length > 0 && (
            <Section icon={AlarmClock} title={t('aiDocs.letters.deadlines')}>
              <ul className="space-y-1.5">
                {e.deadlines.map((d, i) => {
                  const left = daysUntil(d.date);
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                      <span className="font-semibold tabular-nums">{date(d.date)}</span>
                      <span
                        className={clsx(
                          'badge whitespace-nowrap',
                          left < 0 ? 'bg-neutral-bg text-neutral-fg' : left <= 7 ? URGENCY_TONE.high : left <= 21 ? URGENCY_TONE.medium : URGENCY_TONE.low,
                        )}
                      >
                        {left < 0 ? t('aiDocs.letters.overdue') : left === 0 ? t('aiDocs.letters.dueToday') : t('aiDocs.letters.daysLeft', { count: left })}
                      </span>
                      {d.what && <span className="text-muted">{d.what}</span>}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
          {e.steps.length > 0 && (
            <Section icon={ListChecks} title={t('aiDocs.letters.steps')}>
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink">
                {e.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </Section>
          )}
          {e.documents.length > 0 && (
            <Section icon={Paperclip} title={t('aiDocs.letters.documents')}>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                {e.documents.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Section>
          )}
          {e.consequences && (
            <Section icon={ShieldAlert} title={t('aiDocs.letters.consequences')}>
              <p className="text-sm leading-relaxed text-ink">{e.consequences}</p>
            </Section>
          )}
          {e.glossary.length > 0 && (
            <Section icon={BookOpen} title={t('aiDocs.letters.glossary')}>
              <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
                {e.glossary.map((g, i) => (
                  <div key={i} className="contents">
                    <dt className="font-semibold text-ink italic">{g.term}</dt>
                    <dd className="text-muted">{g.meaning}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <p className="flex gap-2 rounded-lg bg-sunken p-3 text-xs leading-relaxed text-muted">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t('aiDocs.letters.disclaimer')}
          </p>

          {askSend && !item.letter.sentAt && (
            <label className="block">
              <span className="text-xs font-semibold text-ink">{t('aiDocs.letters.sendNote')}</span>
              <textarea className="input mt-1 min-h-20" value={note} maxLength={1000} onChange={(ev) => setNote(ev.target.value)} />
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {item.letter.sentAt ? (
              <>
                <span className="badge bg-success-bg text-success-fg">
                  <CheckCircle2 className="size-3.5" aria-hidden /> {t('aiDocs.letters.sentAt')} · {date(item.letter.sentAt)}
                </span>
                {item.letter.sentCaseId && (
                  <Link to={`/account/cases/${item.letter.sentCaseId}#messages`} className="btn-secondary btn-sm">
                    {t('aiDocs.letters.openCase')}
                  </Link>
                )}
              </>
            ) : (
              <button type="button" className="btn-primary btn-sm" disabled={send.isPending} onClick={() => (askSend ? send.mutate() : setAskSend(true))}>
                {send.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                {send.isPending ? t('aiDocs.letters.sending') : t('aiDocs.letters.sendManager')}
              </button>
            )}
            <a href={item.fileUrl} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              <ExternalLink className="size-4" aria-hidden /> {t('aiDocs.letters.open')}
            </a>
            <button
              type="button"
              className="btn-white btn-sm ml-auto border border-line text-danger"
              disabled={remove.isPending}
              onClick={async () => (await confirmDialog({ title: t('ui.confirmDlg.deleteTitle', { name: e.subject ?? item.filename }), message: t('aiDocs.letters.deleteConfirm'), confirmLabel: t('ui.confirmDlg.delete') })) && remove.mutate()}
            >
              <Trash2 className="size-4" aria-hidden /> {t('aiDocs.letters.delete')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
};

/** /account/letters-explain — "Məktubu izah et": photo / PDF of a German letter → plain-language explanation. */
export default function LetterExplain() {
  const { t } = useTranslation();
  usePageTitle(t('aiDocs.letters.title'));
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [limit, setLimit] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const list = useQuery({ queryKey: lettersKey, queryFn: fetchLetters });

  const pick = async (picked: FileList | null) => {
    const incoming = Array.from(picked ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (!incoming.length) return;
    if (incoming.some((f) => !TYPES.includes(f.type))) return void toast.error(t('aiDocs.letters.badType'));
    if (incoming.some((f) => f.size > MAX_BYTES)) return void toast.error(t('aiDocs.letters.tooBig'));
    const next = [...files, ...(await Promise.all(incoming.map(downscale)))];
    const pdfs = next.filter((f) => f.type === 'application/pdf');
    if (next.length > MAX_FILES || (pdfs.length && next.length > 1)) return void toast.error(t('aiDocs.letters.tooMany'));
    setFiles(next);
    setLimit(null);
  };

  const explain = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      return (await api.post<{ item: LetterItem }>('/ai-docs/letters', form, { timeout: 120_000 })).data.item;
    },
    onSuccess: (item) => {
      qc.setQueryData<LetterItem[]>(lettersKey, (l) => [item, ...(l ?? [])]);
      setLatest(item.id);
      setFiles([]);
    },
    onError: (err) => {
      const msg = aiLimitMessage(err);
      if (msg) return setLimit(msg);
      const code = errorCode(err);
      toast.error(t(`aiDocs.letters.errors.${code}`, { defaultValue: t('aiDocs.letters.errors.generic') }));
    },
  });

  const items = list.data ?? [];

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-ink sm:text-2xl">
          <MailQuestion className="size-6 text-primary" aria-hidden /> {t('aiDocs.letters.title')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('aiDocs.letters.subtitle')}</p>
      </div>

      <div className="card space-y-4 p-5 sm:p-6">
        <input ref={inputRef} type="file" accept={TYPES.join(',')} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pick(e.target.files)} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={explain.isPending || files.length >= MAX_FILES}
          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line bg-sunken px-4 py-8 text-center transition hover:border-primary hover:bg-sunken disabled:opacity-60"
        >
          <Camera className="size-8 text-primary" aria-hidden />
          <span className="font-semibold text-ink">{t('aiDocs.letters.pick')}</span>
          <span className="text-xs text-muted">{t('aiDocs.letters.pickHint')}</span>
        </button>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                <span className="shrink-0 text-xs text-muted">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-danger"
                  onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}
                  disabled={explain.isPending}
                  aria-label={`${t('aiDocs.letters.clear')}: ${f.name}`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {limit && <p className="rounded-lg border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg">{limit}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={!files.length || explain.isPending} onClick={() => explain.mutate()}>
            {explain.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {t('aiDocs.letters.explain')}
          </button>
          {explain.isPending && (
            <span className="text-xs text-muted" role="status">
              {t('aiDocs.letters.working')}
            </span>
          )}
        </div>
        <p className="text-xs text-muted">{t('aiDocs.letters.disclaimer')}</p>
      </div>

      <section aria-labelledby="letters-history">
        <h3 id="letters-history" className="mb-3 text-base font-semibold text-ink">
          {t('aiDocs.letters.history')}
        </h3>
        {list.isLoading ? (
          <div className="card grid place-items-center p-8">
            <Loader2 className="size-6 animate-spin text-muted" aria-hidden />
          </div>
        ) : items.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-10 text-center">
            <EmptyInbox className="w-40" />
            <p className="type-card-title mt-3">{t('aiDocs.letters.empty')}</p>
            <p className="mt-1 max-w-md text-sm text-muted">{t('aiDocs.letters.emptyHint')}</p>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {items.map((item) => (
                <LetterCard key={item.id} item={item} defaultOpen={item.id === latest} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{t('aiDocs.letters.vaultNote')}</p>
          </>
        )}
      </section>
    </div>
  );
}

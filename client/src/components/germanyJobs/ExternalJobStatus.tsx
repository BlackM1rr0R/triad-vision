import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BellRing, FileDown, Paperclip, PenLine, Trash2 } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesExternalApps } from '@/i18n/pagesExternalApps';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { useBlobDownload } from '@/components/cv/CvDownloadButton';
import { CoverLetterEditor } from './CoverLetterEditor';
import { EXTERNAL_APP_STATUSES, STATUS_TONE, xappError, type AttachedLetter, type ExternalAppStatus } from './externalApps';
import { ExternalAutoSection, type AutoView } from './ExternalAutoPanel'; // automatic check / sending + overrides
import { EmployerReplies, type EmployerReply } from './EmployerReplies'; // employer answers from the agency mailbox

registerCopy(pagesExternalApps);

interface StaffView {
  listingUrl: string;
  auto: AutoView;
  inquiryId: string;
  userId: string | null;
  status: ExternalAppStatus;
  statusNote: string | null;
  statusChangedAt: string | null;
  events: { id: string; status: ExternalAppStatus; note: string | null; at: string; by: string | null }[];
  coverLetter: AttachedLetter | null;
  cvFromLebenslauf: boolean;
  lebenslauf: { id: string; version: number; createdAt: string } | null;
  anonymized: boolean;
  /** Employer answers matched in the agency mailbox (staff only). */
  replies?: EmployerReply[];
}

/**
 * Staff side of an "apply via Triad Vision" lead (inside ExternalJobPanel): the status the client sees in the
 * portal (+ optional note; saving notifies the client), the history, and the template-based Anschreiben
 * (edit, attach to the application, PDF). Server: routes/admin/externalApplications.ts.
 */
export const ExternalJobStatus = ({ inquiryId }: { inquiryId: string }) => {
  const { t } = useTranslation();
  const uid = useId();
  const qc = useQueryClient();
  const key = ['admin-external-application', inquiryId];
  const base = `/admin/external-applications/${inquiryId}`;
  const q = useQuery({ queryKey: key, queryFn: async () => (await api.get<StaffView>(base)).data });
  const [status, setStatus] = useState<ExternalAppStatus>('SUBMITTED');
  const [note, setNote] = useState('');
  const [letterOpen, setLetterOpen] = useState(false);
  const pdf = useBlobDownload();

  useEffect(() => {
    if (q.data) setStatus(q.data.status);
  }, [q.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const put = (data: StaffView) => qc.setQueryData(key, data);
  const save = useMutation({
    mutationFn: async () => (await api.post<StaffView>(`${base}/status`, { status, note: note.trim() || undefined })).data,
    onSuccess: (data) => {
      put(data);
      setNote('');
      toast.success(t('xapp.status.saved'));
    },
    onError: (err) => toast.error(xappError(err)),
  });
  const attach = useMutation({
    mutationFn: async (v: { subject: string; body: string }) => (await api.put<StaffView>(`${base}/cover-letter`, v)).data,
    onSuccess: (data) => {
      put(data);
      toast.success(t('xapp.letter.attached'));
    },
    onError: (err) => toast.error(xappError(err)),
  });
  const detach = useMutation({
    mutationFn: async () => (await api.delete<StaffView>(`${base}/cover-letter`)).data,
    onSuccess: (data) => {
      put(data);
      toast.success(t('xapp.letter.removed'));
    },
    onError: (err) => toast.error(xappError(err)),
  });

  if (q.isLoading) return <Spinner className="size-5 text-primary" />;
  if (!q.data) return q.isError ? <p className="text-xs text-danger-fg">{xappError(q.error)}</p> : null;
  const v = q.data;
  if (v.anonymized) return <p className="text-xs text-muted">{t('xapp.status.anonymized')}</p>;
  const unchanged = status === v.status && !note.trim();

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {t('xapp.status.current')}: <span className={clsx('badge', STATUS_TONE[v.status])}>{t(`xapp.portal.status.${v.status}`)}</span>
        {v.statusChangedAt && <span>{fmtDateTime(v.statusChangedAt)}</span>}
        {v.cvFromLebenslauf && <span>· {t('xapp.status.fromLebenslauf')}</span>}
      </div>

      <ExternalAutoSection inquiryId={inquiryId} view={v} onUpdate={put} />

      {!!v.replies?.length && <EmployerReplies<StaffView> inquiryId={inquiryId} replies={v.replies} onUpdate={put} />}

      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!unchanged) save.mutate();
        }}
      >
        <div>
          <label className="label" htmlFor={`${uid}-status`}>
            {t('xapp.status.set')}
          </label>
          <select id={`${uid}-status`} className="input" value={status} onChange={(e) => setStatus(e.target.value as ExternalAppStatus)}>
            {EXTERNAL_APP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`xapp.portal.status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-note`}>
            {t('xapp.status.note')}
          </label>
          <textarea id={`${uid}-note`} rows={2} maxLength={1000} className="input resize-y" placeholder={t('xapp.status.notePh')} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={`${uid}-note-hint`} />
          <p id={`${uid}-note-hint`} className="mt-1 text-[11px] text-muted">
            {t('xapp.status.noteHint')} {t('xapp.status.notifyHint')}
          </p>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" icon={BellRing} loading={save.isPending} disabled={unchanged}>
            {t('xapp.status.save')}
          </Button>
        </div>
      </form>

      {v.events.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">
            {t('xapp.status.history')} ({v.events.length})
          </summary>
          <ol className="mt-2 space-y-1.5">
            {v.events
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} className="rounded-md bg-sunken/60 px-2.5 py-1.5">
                  <span className="font-semibold text-ink">{t(`xapp.portal.status.${e.status}`)}</span> · {fmtDateTime(e.at)}
                  {e.by ? ` · ${e.by}` : ''}
                  {e.note && <p className="mt-0.5 whitespace-pre-line break-words text-ink">{e.note}</p>}
                </li>
              ))}
          </ol>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={PenLine} onClick={() => setLetterOpen(true)}>
          {t('xapp.letter.open')}
        </Button>
        {v.coverLetter && (
          <>
            <Button variant="ghost" size="sm" icon={FileDown} loading={pdf.busy} onClick={() => void pdf.run(`${base}/cover-letter.pdf`, 'Anschreiben.pdf')}>
              {v.coverLetter.subject || t('xapp.letter.open')}
            </Button>
            <span className="text-[11px] text-muted">{v.coverLetter.at ? t('xapp.letter.attachedAt', { date: fmtDate(v.coverLetter.at) }) : null}</span>
            <Button variant="ghost" size="sm" icon={Trash2} loading={detach.isPending} onClick={() => detach.mutate()} aria-label={t('xapp.letter.remove')}>
              <span className="sr-only sm:not-sr-only">{t('xapp.letter.remove')}</span>
            </Button>
          </>
        )}
        {v.lebenslauf && v.userId && (
          <Button variant="ghost" size="sm" icon={FileDown} loading={pdf.busy} onClick={() => void pdf.run(`${base}/lebenslauf.pdf`, 'Lebenslauf.pdf')}>
            {t('xapp.status.lebenslauf', { n: v.lebenslauf.version })}
          </Button>
        )}
      </div>

      <CoverLetterEditor
        open={letterOpen}
        onClose={() => setLetterOpen(false)}
        draftUrl={`${base}/cover-letter/draft`}
        pdfUrl={`${base}/cover-letter/pdf`}
        attached={v.coverLetter}
        actions={(letter) => (
          <Button icon={Paperclip} loading={attach.isPending} disabled={!letter.subject.trim() || !letter.body.trim()} onClick={() => attach.mutate(letter)}>
            {t('xapp.letter.attach')}
          </Button>
        )}
      />
    </div>
  );
};

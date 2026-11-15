import { useEffect, useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileDown, Info, RefreshCw } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesExternalApps } from '@/i18n/pagesExternalApps';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { confirmDialog } from '@/components/ui/confirmStore';
import { postPdf, xappError, type AttachedLetter, type CoverDraft, type CoverJobType } from './externalApps';

registerCopy(pagesExternalApps);

export interface LetterText {
  subject: string;
  body: string;
}

/**
 * Anschreiben editor (portal and admin): a draft filled from the German template of the job type (no AI), editable
 * subject + text, template switch, PDF download (DIN 5008 letter). `actions` adds the caller's buttons (attach /
 * save to my letters) and gets the current text.
 */
export const CoverLetterEditor = ({
  open,
  onClose,
  draftUrl,
  pdfUrl,
  attached,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  /** GET → { draft } (?jobType=) */
  draftUrl: string;
  /** POST { subject, body } → PDF */
  pdfUrl: string;
  /** A letter already stored with the application (shown first when present). */
  attached?: AttachedLetter | null;
  actions?: (letter: LetterText, busy: boolean) => ReactNode;
}) => {
  const { t } = useTranslation();
  const uid = useId();
  const [jobType, setJobType] = useState<CoverJobType | null>(null);
  const [letter, setLetter] = useState<LetterText | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [inited, setInited] = useState(false);
  const [fromStored, setFromStored] = useState(false);

  const q = useQuery({
    queryKey: ['cover-letter-draft', draftUrl, jobType],
    queryFn: async () => (await api.get<{ draft: CoverDraft; attached?: AttachedLetter | null }>(draftUrl, { params: jobType ? { jobType } : undefined })).data,
    enabled: open,
    staleTime: 0,
  });

  // A fresh dialog starts from the attached letter (if any), else from the draft.
  useEffect(() => {
    if (!open) {
      setLetter(null);
      setDirty(false);
      setJobType(null);
      setInited(false);
      return;
    }
    if (inited || !q.data) return;
    const stored = attached ?? q.data.attached ?? null;
    const first = stored ?? q.data.draft;
    setLetter({ subject: first.subject, body: first.body });
    setFromStored(!!stored);
    setInited(true);
  }, [open, attached, q.data, inited]);

  const applyDraft = async (d: CoverDraft | undefined) => {
    if (!d) return;
    if (dirty && !(await confirmDialog({ message: t('xapp.letter.regenerateConfirm'), tone: 'primary' }))) return;
    setLetter({ subject: d.subject, body: d.body });
    setDirty(false);
    setFromStored(false);
  };

  const changeTemplate = async (next: CoverJobType) => {
    if (dirty && !(await confirmDialog({ message: t('xapp.letter.regenerateConfirm'), tone: 'primary' }))) return;
    setDirty(false);
    setFromStored(false);
    setLetter(null);
    setJobType(next);
  };

  // After a template switch the new draft replaces the text.
  useEffect(() => {
    const d = q.data?.draft;
    if (open && jobType && d && d.jobType === jobType && !letter) setLetter({ subject: d.subject, body: d.body });
  }, [open, jobType, q.data, letter]);

  const edit = (patch: Partial<LetterText>) => {
    setLetter((l) => ({ subject: '', body: '', ...l, ...patch }));
    setDirty(true);
  };

  const download = async () => {
    if (!letter?.subject.trim() || !letter.body.trim()) return;
    setPdfBusy(true);
    const err = await postPdf(pdfUrl, letter, 'Anschreiben.pdf');
    setPdfBusy(false);
    if (err) toast.error(err);
  };

  const draft = q.data?.draft;
  const ready = !!letter?.subject.trim() && !!letter.body.trim();
  const current = jobType ?? draft?.jobType ?? '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('xapp.letter.title')}
      description={t('xapp.letter.intro')}
      size="xl"
      mobile="full"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('xapp.letter.close')}
          </Button>
          <Button variant="secondary" icon={FileDown} loading={pdfBusy} disabled={!ready} onClick={() => void download()}>
            {t('xapp.letter.download')}
          </Button>
          {letter && actions?.(letter, pdfBusy)}
        </>
      }
    >
      {q.isError && <p className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">{xappError(q.error)}</p>}
      {!letter && q.isLoading ? (
        <div className="grid min-h-40 place-items-center">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {fromStored && <p className="rounded-lg border border-line bg-sunken/60 px-3 py-2 text-xs text-muted">{t('xapp.letter.attachedTitle')}</p>}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor={`${uid}-tpl`}>
                {t('xapp.letter.template')}
              </label>
              <select id={`${uid}-tpl`} className="input" value={current} onChange={(e) => void changeTemplate(e.target.value as CoverJobType)} disabled={!draft}>
                {(draft?.templates ?? []).map((tp) => (
                  <option key={tp.jobType} value={tp.jobType}>
                    {t(`xapp.letter.jobTypes.${tp.jobType}`)} — {tp.name}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" icon={RefreshCw} onClick={() => void (q.isFetching ? undefined : q.refetch().then((r) => applyDraft(r.data?.draft)))} loading={q.isFetching}>
              {t('xapp.letter.regenerate')}
            </Button>
          </div>
          {draft && draft.missing.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('xapp.letter.missing', { list: draft.missing.map((m) => `{{${m}}}`).join(', '), interpolation: { escapeValue: false } })}
            </p>
          )}
          <div>
            <label className="label" htmlFor={`${uid}-subject`}>
              {t('xapp.letter.subject')}
            </label>
            <input id={`${uid}-subject`} className="input" maxLength={300} value={letter?.subject ?? ''} onChange={(e) => edit({ subject: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor={`${uid}-body`}>
              {t('xapp.letter.body')}
            </label>
            <textarea id={`${uid}-body`} className="input min-h-[22rem] resize-y font-[inherit] leading-relaxed" maxLength={20_000} value={letter?.body ?? ''} onChange={(e) => edit({ body: e.target.value })} lang="de" spellCheck />
            <p className="mt-1 text-xs text-muted">{t('xapp.letter.hintGerman')}</p>
          </div>
        </div>
      )}
    </Modal>
  );
};

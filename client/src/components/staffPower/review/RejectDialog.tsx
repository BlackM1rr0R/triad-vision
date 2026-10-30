import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fileUrl } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { MarkEditor } from '@/components/review/MarkEditor'; // marks on the rejected scan (shown to the client)
import { cleanMarks, type ReviewMark } from '@/components/review/marks';

/** Common rejection reasons (sp.review.reasons.<key>); the text goes to the client in the review note. */
export const REJECT_REASONS = ['unreadable', 'cutOff', 'wrongDocument', 'expired', 'nameMismatch', 'missingPages', 'translation', 'certified', 'colour'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** Reasons suggested by the upload AI findings. */
export const suggestedReasons = (flags: string[], qualityLevel: string | null | undefined): RejectReason[] => {
  const out: RejectReason[] = [];
  if (qualityLevel === 'BAD') out.push('unreadable');
  if (flags.includes('NAME_MISMATCH')) out.push('nameMismatch');
  if (flags.includes('EXPIRED')) out.push('expired');
  if (flags.includes('WRONG_REQUIREMENT')) out.push('wrongDocument');
  return out;
};

/**
 * R in the fast review: pick one or more common reasons (number keys 1–9 toggle them), add free text and,
 * optionally, mark the problem areas on the scan (MarkEditor). The note sent is the reasons + the free text.
 */
export const RejectDialog = ({
  open,
  doc,
  suggested,
  onClose,
  onConfirm,
}: {
  open: boolean;
  doc: { id: string; mimeType: string } | null;
  suggested: RejectReason[];
  onClose: () => void;
  onConfirm: (note: string, marks: ReviewMark[]) => void;
}) => {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<RejectReason[]>([]);
  const [text, setText] = useState('');
  const [marks, setMarks] = useState<ReviewMark[]>([]);
  const [showMarks, setShowMarks] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPicked(suggested);
    setText('');
    setMarks([]);
    setShowMarks(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.id]);

  const toggle = (r: RejectReason) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  const note = [...picked.map((r) => t(`sp.review.reasons.${r}`)), text.trim()].filter(Boolean).join('. ');
  const submit = () => {
    if (note.length < 1) return;
    onConfirm(note.slice(0, 1000), cleanMarks(marks));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sp.review.rejectTitle')}
      description={t('sp.review.rejectHint')}
      size={showMarks ? 'xl' : 'md'}
      zIndex={95}
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('admin.common.cancel')}
          </Button>
          <Button type="submit" variant="danger" disabled={!note}>
            {t('sp.review.reject')}
          </Button>
        </>
      }
    >
      <div
        className="space-y-3 text-sm"
        onKeyDown={(e) => {
          // 1–9 toggle a reason (not while typing).
          const tag = (e.target as HTMLElement).tagName;
          if (tag === 'TEXTAREA' || tag === 'INPUT') return;
          const n = Number(e.key);
          if (n >= 1 && n <= REJECT_REASONS.length) {
            e.preventDefault();
            toggle(REJECT_REASONS[n - 1]);
          }
        }}
      >
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-muted">{t('sp.review.commonReasons')}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {REJECT_REASONS.map((r, i) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 hover:border-line-strong has-[:checked]:border-danger-fg/50 has-[:checked]:bg-danger-bg/40">
                <input type="checkbox" className="size-4 accent-primary" checked={picked.includes(r)} onChange={() => toggle(r)} data-autofocus={i === 0 ? true : undefined} />
                <span className="min-w-0 flex-1">{t(`sp.review.reasons.${r}`)}</span>
                <kbd className="rounded border border-line bg-sunken px-1 text-[10px] text-muted">{i + 1}</kbd>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">{t('sp.review.freeText')}</span>
          <textarea className="input min-h-20" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
        </label>
        {doc && (
          <div>
            <button type="button" className="text-xs font-semibold text-link hover:underline" onClick={() => setShowMarks((v) => !v)}>
              {showMarks ? t('sp.review.hideMarks') : t('sp.review.addMarks')}
              {marks.length > 0 && ` (${marks.length})`}
            </button>
            {showMarks && <MarkEditor src={fileUrl(doc.id)} mimeType={doc.mimeType} value={marks} onChange={setMarks} className="mt-2" />}
          </div>
        )}
        {note && (
          <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
            <span className="font-semibold text-ink">{t('sp.review.clientSees')}</span> {note}
          </p>
        )}
      </div>
    </Modal>
  );
};

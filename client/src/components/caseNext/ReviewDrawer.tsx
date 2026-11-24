import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, CheckCheck, ExternalLink, X } from 'lucide-react';
import { api, fileUrl, formatBytes } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail, CaseDocument, Requirement } from '@/lib/types';
import { Drawer } from '@/components/admin/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { DocIcon, caseKey, type CaseDetailResponse } from '@/components/admin/case/shared';

const REASONS = ['blurry', 'incomplete', 'expired', 'wrong'] as const;

/** Rejection reasons in the CLIENT's language (the note is shown to the client). */
const REASON_TEXT: Record<string, Record<(typeof REASONS)[number], string>> = {
  az: { blurry: 'Sənəd oxunmur və ya bulanıqdır — zəhmət olmasa aydın surət yükləyin.', incomplete: 'Sənəd natamamdır — zəhmət olmasa bütün səhifələri yükləyin.', expired: 'Sənədin müddəti bitib — zəhmət olmasa etibarlı sənəd yükləyin.', wrong: 'Bu, tələb olunan sənəd deyil — zəhmət olmasa düzgün sənədi yükləyin.' },
  de: { blurry: 'Das Dokument ist unleserlich oder unscharf – bitte laden Sie eine gut lesbare Kopie hoch.', incomplete: 'Das Dokument ist unvollständig – bitte laden Sie alle Seiten hoch.', expired: 'Das Dokument ist abgelaufen – bitte laden Sie ein gültiges Dokument hoch.', wrong: 'Das ist nicht das angeforderte Dokument – bitte laden Sie das richtige hoch.' },
  en: { blurry: 'The document is unreadable or blurry — please upload a clear copy.', incomplete: 'The document is incomplete — please upload all pages.', expired: 'The document has expired — please upload a valid one.', wrong: 'This is not the requested document — please upload the correct one.' },
  ru: { blurry: 'Документ нечитаемый или размытый — пожалуйста, загрузите чёткую копию.', incomplete: 'Документ неполный — пожалуйста, загрузите все страницы.', expired: 'Срок действия документа истёк — пожалуйста, загрузите действующий.', wrong: 'Это не тот документ — пожалуйста, загрузите нужный.' },
};

/**
 * Pending documents of a next-step "Review now" action: open, accept (one / all), reject with a one-click reason.
 *
 * Every decision is applied IN PLACE: the case in the query cache gets the new document status at once (no refetch, so
 * nothing on the page remounts or reflows and the scroll position stays), the list keeps its place and the focus moves
 * on to the next pending document. The case is refreshed from the server once, when the panel closes.
 */
export const ReviewDrawer = ({ open, onClose, c, documentIds, onChanged }: { open: boolean; onClose: () => void; c: CaseDetail; documentIds: string[]; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, 'ACCEPTED' | 'REJECTED'>>({});
  const qc = useQueryClient();
  const changed = useRef(false);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const [advanceTo, setAdvanceTo] = useState<string | null>(null);

  const rows: { doc: CaseDocument; req: Requirement }[] = c.requirements.flatMap((r) => r.documents.filter((d) => documentIds.includes(d.id)).map((doc) => ({ doc, req: r })));
  const left = rows.filter((r) => !done[r.doc.id] && r.doc.status === 'PENDING');
  const clientLocale = c.client.locale || 'az';

  const review = async (docId: string, status: 'ACCEPTED' | 'REJECTED', note?: string) => {
    await api.post(`/admin/cases/${c.id}/documents/${docId}/review`, { status, note });
    changed.current = true;
    setDone((d) => ({ ...d, [docId]: status }));
    // Optimistic, in place: the document's status in the cached case (the server refresh follows on close).
    qc.setQueryData<CaseDetailResponse>(caseKey(c.id), (old) =>
      old ? { ...old, case: { ...old.case, requirements: old.case.requirements.map((r) => ({ ...r, documents: r.documents.map((d) => (d.id === docId ? { ...d, status } : d)) })) } } : old,
    );
  };

  // After a decision the next pending document comes into view (inside the panel only) and takes the focus.
  useEffect(() => {
    if (!advanceTo) return;
    const el = itemRefs.current.get(advanceTo);
    // Scroll only the panel's own list: element.scrollIntoView() also scrolls every scrollable ancestor, which
    // moved the case page behind the drawer to the top after each decision.
    if (el) {
      let box: HTMLElement | null = el.parentElement;
      while (box && !(box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
      if (box && el.closest('[role="dialog"]')?.contains(box)) {
        const r = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (r.top < b.top) box.scrollTop -= b.top - r.top;
        else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
      }
    }
    el?.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true });
    setAdvanceTo(null);
  }, [advanceTo]);

  const close = () => {
    onClose();
    if (changed.current) {
      changed.current = false;
      onChanged();
    }
  };

  const one = async (docId: string, status: 'ACCEPTED' | 'REJECTED', note?: string) => {
    setBusy(docId);
    try {
      await review(docId, status, note);
      setRejecting(null);
      const next = rows.find((r) => r.doc.id !== docId && !done[r.doc.id] && r.doc.status === 'PENDING');
      if (next) setAdvanceTo(next.doc.id);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const acceptAll = async () => {
    setBusy('all');
    try {
      for (const r of left) await review(r.doc.id, 'ACCEPTED');
      toast.success(t('caseNext.review.accepted'));
      close();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title={t('caseNext.review.title')}
      footer={
        <button type="button" className="btn-primary btn-sm" disabled={!left.length || !!busy} onClick={() => void acceptAll()}>
          {busy === 'all' ? <Spinner className="size-3.5" /> : <CheckCheck className="size-3.5" aria-hidden />} {t('caseNext.review.acceptAll')} ({left.length})
        </button>
      }
    >
      {!rows.length ? (
        <p className="text-sm text-muted">{t('caseNext.review.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ doc, req }) => {
            const state = done[doc.id] ?? (doc.status !== 'PENDING' ? doc.status : null);
            return (
              <li
                key={doc.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(doc.id, el);
                  else itemRefs.current.delete(doc.id);
                }}
                className={clsx('rounded-xl border border-line p-3 sm:p-4', state && 'opacity-70')}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-muted">
                    <DocIcon mime={doc.mimeType} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{tr(req.title)}</p>
                    <p className="truncate text-xs text-muted">
                      {doc.originalName} · {formatBytes(doc.size)} · {fmtDateTime(doc.createdAt)}
                    </p>
                  </div>
                  <a href={fileUrl(doc.id)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm shrink-0 border border-line" aria-label={`${t('caseNext.review.open')}: ${doc.originalName}`}>
                    <ExternalLink className="size-3.5" aria-hidden /> <span className="hidden sm:inline">{t('caseNext.review.open')}</span>
                  </a>
                </div>
                {state ? (
                  <p className={clsx('mt-2 text-xs font-semibold', state === 'ACCEPTED' ? 'text-success-fg dark:text-emerald-300' : 'text-danger-fg dark:text-red-300')}>
                    {state === 'ACCEPTED' ? t('caseNext.review.accepted') : t('caseNext.review.rejected')}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary btn-sm" disabled={!!busy} onClick={() => void one(doc.id, 'ACCEPTED')}>
                      {busy === doc.id ? <Spinner className="size-3.5" /> : <Check className="size-3.5" aria-hidden />} {t('caseNext.review.accept')}
                    </button>
                    <button type="button" className="btn-secondary btn-sm" disabled={!!busy} aria-expanded={rejecting === doc.id} onClick={() => setRejecting(rejecting === doc.id ? null : doc.id)}>
                      <X className="size-3.5" aria-hidden /> {t('caseNext.review.reject')}
                    </button>
                  </div>
                )}
                {rejecting === doc.id && !state && (
                  <div className="mt-3 rounded-lg bg-sunken p-3">
                    <p className="mb-2 text-xs text-muted">{t('caseNext.review.reasonsTitle')}</p>
                    <div className="flex flex-wrap gap-2">
                      {REASONS.map((r) => (
                        <button key={r} type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void one(doc.id, 'REJECTED', (REASON_TEXT[clientLocale] ?? REASON_TEXT.az)[r])}>
                          {t(`caseNext.review.reasons.${r}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
};

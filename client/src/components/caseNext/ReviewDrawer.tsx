import { useState } from 'react';
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
import { DocIcon } from '@/components/admin/case/shared';

const REASONS = ['blurry', 'incomplete', 'expired', 'wrong'] as const;

/** Rejection reasons in the CLIENT's language (the note is shown to the client). */
const REASON_TEXT: Record<string, Record<(typeof REASONS)[number], string>> = {
  az: { blurry: 'Sənəd oxunmur və ya bulanıqdır — zəhmət olmasa aydın surət yükləyin.', incomplete: 'Sənəd natamamdır — zəhmət olmasa bütün səhifələri yükləyin.', expired: 'Sənədin müddəti bitib — zəhmət olmasa etibarlı sənəd yükləyin.', wrong: 'Bu, tələb olunan sənəd deyil — zəhmət olmasa düzgün sənədi yükləyin.' },
  de: { blurry: 'Das Dokument ist unleserlich oder unscharf – bitte laden Sie eine gut lesbare Kopie hoch.', incomplete: 'Das Dokument ist unvollständig – bitte laden Sie alle Seiten hoch.', expired: 'Das Dokument ist abgelaufen – bitte laden Sie ein gültiges Dokument hoch.', wrong: 'Das ist nicht das angeforderte Dokument – bitte laden Sie das richtige hoch.' },
  en: { blurry: 'The document is unreadable or blurry — please upload a clear copy.', incomplete: 'The document is incomplete — please upload all pages.', expired: 'The document has expired — please upload a valid one.', wrong: 'This is not the requested document — please upload the correct one.' },
  ru: { blurry: 'Документ нечитаемый или размытый — пожалуйста, загрузите чёткую копию.', incomplete: 'Документ неполный — пожалуйста, загрузите все страницы.', expired: 'Срок действия документа истёк — пожалуйста, загрузите действующий.', wrong: 'Это не тот документ — пожалуйста, загрузите нужный.' },
};

/** Pending documents of a next-step "Review now" action: open, accept (one / all), reject with a one-click reason. */
export const ReviewDrawer = ({ open, onClose, c, documentIds, onChanged }: { open: boolean; onClose: () => void; c: CaseDetail; documentIds: string[]; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, 'ACCEPTED' | 'REJECTED'>>({});

  const rows: { doc: CaseDocument; req: Requirement }[] = c.requirements.flatMap((r) => r.documents.filter((d) => documentIds.includes(d.id)).map((doc) => ({ doc, req: r })));
  const left = rows.filter((r) => !done[r.doc.id] && r.doc.status === 'PENDING');
  const clientLocale = c.client.locale || 'az';

  const review = async (docId: string, status: 'ACCEPTED' | 'REJECTED', note?: string) => {
    await api.post(`/admin/cases/${c.id}/documents/${docId}/review`, { status, note });
    setDone((d) => ({ ...d, [docId]: status }));
  };

  const one = async (docId: string, status: 'ACCEPTED' | 'REJECTED', note?: string) => {
    setBusy(docId);
    try {
      await review(docId, status, note);
      setRejecting(null);
      onChanged();
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
      onChanged();
      onClose();
    } catch (err) {
      toastError(err);
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
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
              <li key={doc.id} className={clsx('rounded-xl border border-line p-3 sm:p-4', state && 'opacity-70')}>
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

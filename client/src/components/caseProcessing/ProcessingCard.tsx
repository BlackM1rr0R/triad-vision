import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, ClipboardPen, FileText, FolderOpen, History, Paperclip } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { fileUrl } from '@/lib/api';
import { fmtDateTime } from '@/components/admin/labels';
import { TONE_CLASS } from '@/components/ui/status';
import { stageLabel, useProcessing, type ProcessingStage, type ProcessingView } from './api';
import { MoveStageDialog, StageBadge } from './parts';

const FILES_SHOWN = 8;

/** Files in the client folder + uploads without a copy there: what the second person checks and finishes. */
const DocumentList = ({ d }: { d: ProcessingView['documents'] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const [all, setAll] = useState(false);
  const files = all ? d.files : d.files.slice(0, FILES_SHOWN);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('caseProcessing.documentsHint')}</p>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-ink">{t('caseProcessing.filesTitle', { count: d.files.length })}</p>
          {d.folderId && (
            <Link to={`/workspace/drive/f/${encodeURIComponent(d.folderId)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
              <FolderOpen className="size-3.5" aria-hidden /> {t('caseProcessing.openFolder')}
            </Link>
          )}
        </div>
        {d.files.length === 0 ? (
          <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{t('caseProcessing.noFiles')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {files.map((f) => (
              <li key={f.id}>
                <Link to={f.link} className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm transition hover:bg-sunken">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{f.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {f.path ? `${f.path} · ` : ''}
                      {fmtDateTime(f.updatedAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {d.files.length > FILES_SHOWN && (
          <button type="button" className="mt-1.5 text-xs font-semibold text-link hover:underline" onClick={() => setAll((v) => !v)}>
            {all ? t('caseProcessing.showLess') : t('caseProcessing.showAll', { count: d.files.length })}
          </button>
        )}
      </div>
      {d.uploads.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink">{t('caseProcessing.uploadsTitle', { count: d.uploads.length })}</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {d.uploads.map((u) => (
              <li key={u.id}>
                <a href={fileUrl(u.id)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm transition hover:bg-sunken">
                  <Paperclip className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{u.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {u.requirement ? `${tr(u.requirement)} · ` : ''}
                      {fmtDateTime(u.createdAt)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * Case page strip "Sənəd işi": the team's own hand-over (In Bearbeitung → Schon geschrieben → Fertig, Ablehnung)
 * with who moved it, the next assignee, the document list (open for the second person at "Schon geschrieben")
 * and the history. Anchor #case-processing (notifications and "my work" link here).
 */
export default function ProcessingCard({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const q = useProcessing(caseId);
  const [dialog, setDialog] = useState<{ open: boolean; initial?: ProcessingStage }>({ open: false });
  const p = q.data;
  if (!p) return null;
  const mine = !!p.assignee && p.assignee.id === user?.id;
  // The obvious next move: write → check → done.
  const next: ProcessingStage | null = p.stage === 'WRITTEN' ? 'DONE' : p.stage === 'IN_PROGRESS' || p.stage === null ? 'WRITTEN' : null;
  const docCount = p.documents.files.length + p.documents.uploads.length;

  return (
    <section id="case-processing" aria-label={t('caseProcessing.title')} className={clsx('scroll-mt-40 rounded-xl border bg-card', mine ? 'border-primary/50 shadow-[inset_3px_0_0_var(--color-brand-600)]' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <ClipboardPen className="size-4 shrink-0 text-link" aria-hidden />
        <h2 className="text-sm font-semibold text-ink">{t('caseProcessing.title')}</h2>
        <StageBadge stage={p.stage} />
        {p.by && p.at && <span className="text-xs text-muted">{t('caseProcessing.movedBy', { name: p.by.name, date: fmtDateTime(p.at) })}</span>}
        {p.assignee && (
          <span className={clsx('badge', mine ? TONE_CLASS.info : TONE_CLASS.neutral)}>
            {mine && p.by ? t('caseProcessing.waitingYou', { name: p.by.name }) : t('caseProcessing.assignedTo', { name: p.assignee.name })}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {next && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setDialog({ open: true, initial: next })}>
              {t('caseProcessing.moveTo', { stage: stageLabel(next) })} <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setDialog({ open: true })}>
            {t('caseProcessing.move')}
          </button>
        </div>
      </div>
      {p.history[0]?.note && <p className="mx-4 mb-3 rounded-lg bg-sunken px-3 py-2 text-sm break-words whitespace-pre-line text-ink/90">“{p.history[0].note}”</p>}

      <details className="group border-t border-line" open={p.stage === 'WRITTEN'}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs font-semibold text-ink hover:bg-sunken">
          <FileText className="size-3.5 text-muted" aria-hidden /> {t('caseProcessing.documents')} <span className="text-muted tabular-nums">({docCount})</span>
        </summary>
        <div className="px-4 pb-4">
          <DocumentList d={p.documents} />
        </div>
      </details>
      <details className="border-t border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs font-semibold text-ink hover:bg-sunken">
          <History className="size-3.5 text-muted" aria-hidden /> {t('caseProcessing.history')} <span className="text-muted tabular-nums">({p.history.length})</span>
        </summary>
        <div className="px-4 pb-4">
          {p.history.length === 0 ? (
            <p className="text-xs text-muted">{t('caseProcessing.historyEmpty')}</p>
          ) : (
            <ol className="space-y-2">
              {p.history.map((h) => (
                <li key={h.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <StageBadge stage={h.fromStage} /> <ArrowRight className="size-3 text-muted" aria-hidden /> <StageBadge stage={h.toStage} />
                    {h.assignee && <span className="text-xs font-medium text-ink/80">{t('caseProcessing.toPerson', { name: h.assignee.name })}</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{t('caseProcessing.movedBy', { name: h.by?.name ?? '—', date: fmtDateTime(h.createdAt) })}</p>
                  {h.note && <p className="mt-1 break-words whitespace-pre-line text-ink/90">{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>

      <MoveStageDialog caseId={caseId} open={dialog.open} initial={dialog.initial} current={p.stage} onClose={() => setDialog({ open: false })} />
    </section>
  );
}

import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BellRing } from 'lucide-react';
import '@/components/caseNext/api'; // registers the case-next copy (caseNext.attention.*)

/** "Waits for staff action" (server lib/staffAttention): the client signed / documents to review. */
export type AttentionKind = 'CLIENT_SIGNED' | 'DOCS_REVIEW';

const SIGNATURE_REASONS = new Set(['TRIAD_SIGN_CONTRACT', 'CHECK_SIGNATURE', 'APPROVE_WORK_CONTRACT']);

/** Same rule as the server's attentionOfBall, for places that only have the case's ball in court (case page header). */
export const attentionOfBall = (ball: { side: string; reason: string } | null | undefined): AttentionKind | null => {
  if (!ball || ball.side !== 'TEAM') return null;
  if (SIGNATURE_REASONS.has(ball.reason)) return 'CLIENT_SIGNED';
  if (ball.reason === 'REVIEW_DOCS') return 'DOCS_REVIEW';
  return null;
};

/** Orange badge in the cases list row and the case page header; nothing when no staff action is due. */
export const AttentionBadge = ({ kind, className }: { kind: AttentionKind | null | undefined; className?: string }) => {
  const { t } = useTranslation();
  if (!kind) return null;
  return (
    <span
      className={clsx('inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning-fg ring-1 ring-warning-border', className)}
      title={t(`caseNext.attention.${kind}Hint`)}
    >
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-warning-fg" aria-hidden />
      <BellRing className="size-3 shrink-0" aria-hidden />
      {t(`caseNext.attention.${kind}`)}
    </span>
  );
};

import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { asChecks } from './api';

/**
 * Tiny badge for the automatic document checks (Document.checks / VaultDocument.checks). The tooltip
 * lists the findings. Renders nothing for documents uploaded before the checks existed.
 */
export const DocCheckBadge = ({ checks, showOk = true, className }: { checks: unknown; showOk?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const c = asChecks(checks);
  if (!c) return null;
  if (c.level === 'ok' && !c.pending && !showOk) return null;

  const state = c.pending && c.level === 'ok' ? 'pending' : c.level;
  const Icon = state === 'error' ? XCircle : state === 'warn' ? AlertTriangle : state === 'pending' ? Loader2 : CheckCircle2;
  const tone =
    state === 'error'
      ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : state === 'warn'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
        : state === 'pending'
          ? 'bg-surface text-muted'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  const tip = c.issues.map((i) => `• ${t(`vault.check.server.${i.code}`, i.params)}`).join('\n');

  return (
    <span className={clsx('badge inline-flex items-center gap-1 whitespace-nowrap', tone, className)} title={tip || t(`vault.badge.${state}`)}>
      <Icon className={clsx('size-3.5', state === 'pending' && 'animate-spin')} aria-hidden />
      {t(`vault.badge.${state}`)}
      {c.issues.length > 1 && <span aria-hidden>·{c.issues.length}</span>}
    </span>
  );
};

export default DocCheckBadge;

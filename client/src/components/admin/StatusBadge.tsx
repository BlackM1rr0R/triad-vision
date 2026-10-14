import type { ReactNode } from 'react';
import clsx from 'clsx';
import { STATUS_TONE } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';
import { STATUS_LABEL } from './labels';

export const StatusBadge = ({ status, className }: { status: CaseStatus; className?: string }) => (
  <span className={clsx('badge whitespace-nowrap', STATUS_TONE[status], className)}>
    <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
    {STATUS_LABEL[status]}
  </span>
);

export const ToneBadge = ({ tone, children, className }: { tone: string; children: ReactNode; className?: string }) => (
  <span className={clsx('badge whitespace-nowrap', tone, className)}>{children}</span>
);

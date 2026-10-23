import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ShieldCheck } from 'lucide-react';
import { confirmKey, CONFIRM_TONE, fetchConfirmation } from './api';

/** Case header: data confirmation state ("Data confirmed ✓", "Confirmation pending", "Data changed since") — scrolls to the panel. */
export default function ConfirmationChip({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: confirmKey(caseId), queryFn: () => fetchConfirmation(caseId), staleTime: 30_000 });
  if (!data) return null;
  const s = data.state.state;
  return (
    <button
      type="button"
      onClick={() => document.getElementById('case-data')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className={clsx('badge inline-flex min-h-6 cursor-pointer items-center gap-1', CONFIRM_TONE[s])}
      title={t('clientData.admin.confirm.title')}
    >
      <ShieldCheck className="size-3" aria-hidden /> {t(`clientData.chip.${s}`)}
    </button>
  );
}

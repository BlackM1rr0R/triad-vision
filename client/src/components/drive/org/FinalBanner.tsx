import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { driveOrgCopy } from '@/i18n/pagesDriveOrg';
import { api } from '@/lib/api';
import { driveKeys } from '../api';
import type { NodeDetails } from '../types';

registerCopy(driveOrgCopy);

/** Whether a drive file is marked "Final" (editors open read-only then; the server refuses saves with 423). */
export const useIsFinal = (nodeId: string | null | undefined) => {
  const q = useQuery({
    queryKey: driveKeys.node(nodeId ?? ''),
    queryFn: async () => (await api.get<NodeDetails>(`/drive/nodes/${encodeURIComponent(nodeId!)}`)).data,
    enabled: !!nodeId,
    staleTime: 30_000,
  });
  return !!q.data?.item.finalAt;
};

/** Banner for the sheet and document editors: "Bu fayl Final kimi işarələnib". */
export const FinalBanner = ({ nodeId, final }: { nodeId?: string | null; final?: boolean }) => {
  const { t } = useTranslation();
  const isFinal = useIsFinal(final === undefined ? nodeId : null);
  if (!(final ?? isFinal)) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-line-strong bg-sunken px-4 py-2 text-sm font-medium text-ink dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
      <Lock className="size-4 shrink-0" aria-hidden />
      {t('driveOrg.final.editorBanner')}
    </div>
  );
};

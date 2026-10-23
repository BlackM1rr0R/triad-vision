import { useEffect } from 'react';
import { usePackageOpen } from '@/components/caseNext/api';

/**
 * The embassy package drawer lives in the Sənədlər tab (EmbassyPackagePanel). When it is opened from
 * elsewhere (next-step card, header menu) this tells the page to mount that tab so the drawer can show.
 */
export default function PackageWatcher({ caseId, onOpen }: { caseId: string; onOpen: () => void }) {
  const open = usePackageOpen(caseId);
  useEffect(() => {
    if (open) onOpen();
  }, [open, onOpen]);
  return null;
}

import { ForecastChip } from '@/components/journey/ForecastStrip';
import ConfirmationChip from '@/components/clientData/ConfirmationChip';
import DuplicateBadge from '@/components/duplicates/DuplicateBadge';
import { useRelationLabel } from '@/components/journey/Family';
import { Badge } from '@/components/ui/Badge';

/**
 * Status chips of the sticky case header (own chunk): family relation, decision forecast, client-data confirmation and the
 * "possible duplicate" badge. The confirmation chip opens the client-data panel on the Ümumi tab.
 */
export default function HeaderChips({ caseId, clientId, relation, onOpenData }: { caseId: string; clientId: string; relation: string | null; onOpenData: () => void }) {
  const relationLabel = useRelationLabel()(relation);
  return (
    <>
      {relationLabel && <Badge tone="accent">{relationLabel}</Badge>}
      <ForecastChip caseId={caseId} className="min-h-6 py-0.5 text-[11px]" />
      {/* The chip scrolls by itself, which cannot reach a section on another tab: take the click over. */}
      <span
        className="contents"
        onClickCapture={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onOpenData();
        }}
      >
        <ConfirmationChip caseId={caseId} />
      </span>
      <DuplicateBadge userId={clientId} />
    </>
  );
}

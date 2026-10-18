import { Suspense, lazy, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileDiff, PenLine, Signature, Users, WandSparkles } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { driveIntelCopy } from '@/i18n/pagesDriveIntel';
import type { MenuEntry } from '../ContextMenu';
import type { ToolAction } from '../Toolbar';
import { invalidateDrive } from '../api';
import { can, type DriveItem, type RootsResponse } from '../types';
import { comparable, fetchEsignStatus, intelKeys, isPdf, isTemplateCandidate, type EsignStatus, type SearchItem } from './api';
import { SearchHits } from './SearchHits';

registerCopy(driveIntelCopy);

const CompareDialog = lazy(() => import('./CompareDialog'));
const FillDialog = lazy(() => import('./FillDialog'));
const EsignDialog = lazy(() => import('./EsignDialog'));

type Dialog = { kind: 'compare'; item: DriveItem } | { kind: 'fill'; item: DriveItem; bulk: boolean } | { kind: 'esign'; item: DriveItem } | null;

const PREF = 'tv-drive-search-content';
const readPref = () => {
  try {
    return localStorage.getItem(PREF) !== '0';
  } catch {
    return true;
  }
};

/** "Mətn daxilində axtar" (default on, remembered per browser): [on, setOn]. */
export const useSearchInContent = () => {
  const [on, setOnState] = useState(readPref);
  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    try {
      localStorage.setItem(PREF, v ? '1' : '0');
    } catch {
      // private mode: the choice lasts for this page only
    }
  }, []);
  return [on, setOn] as const;
};

/** "İmzada" / "İmzalanıb" chip of a file with a signature request started from the drive. */
export const EsignChip = ({ status }: { status: EsignStatus | undefined }) => {
  const { t } = useTranslation();
  if (!status || (!status.open && status.status !== 'COMPLETED')) return null;
  return (
    <span
      className={
        status.open
          ? 'inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
          : 'inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
      }
      title={`${status.signed}/${status.total}`}
    >
      <Signature className="size-3" aria-hidden />
      {status.open ? `${t('driveIntel.menu.inSigning')} ${status.signed}/${status.total}` : t('driveIntel.menu.signed')}
    </span>
  );
};

/**
 * Document intelligence in the explorer: menu entries (compare versions, fill a template with client data,
 * send for signature), toolbar actions and chips, the content-search toggle and snippets, and the lazily
 * loaded dialogs. Drive.tsx only wires the pieces in.
 */
export const useDriveIntel = ({ roots, items, folderId, trail = [], onOpenFolder }: { roots: RootsResponse | undefined; items: DriveItem[]; folderId: string | null; trail?: string[]; onOpenFolder?: (id: string) => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);

  const templatesId = roots?.sections?.templates ?? roots?.templates?.id ?? null;
  const inTemplates = useCallback(
    (i: DriveItem) => !!templatesId && (i.parentId === templatesId || i.location?.id === templatesId || (i.parentId === folderId && trail.includes(templatesId))),
    [templatesId, folderId, trail],
  );

  // Signature status of the PDFs on screen (cheap lookup, one request per listing).
  const pdfIds = useMemo(() => items.filter((i) => isPdf(i) && !i.virtual).map((i) => i.id).slice(0, 300).sort(), [items]);
  const idsKey = pdfIds.join(',');
  const esign = useQuery({
    queryKey: intelKeys.esign(idsKey),
    queryFn: () => fetchEsignStatus(pdfIds),
    enabled: pdfIds.length > 0,
    staleTime: 30_000,
  });
  const statusOf = useCallback((id: string) => esign.data?.[id], [esign.data]);

  const menuEntries = (list: DriveItem[] | null): MenuEntry[] => {
    if (!list || list.length !== 1) return [];
    const it = list[0];
    if (it.kind !== 'FILE' || it.virtual) return [];
    const out: MenuEntry[] = [];
    const fill = isTemplateCandidate(it) && can(it.myAccess, 'DOWNLOAD');
    const tpl = fill && inTemplates(it);
    if (fill) {
      out.push(
        { id: 'intel-fill', label: t('driveIntel.menu.fill'), icon: WandSparkles, active: tpl, onSelect: () => setDialog({ kind: 'fill', item: it, bulk: false }) },
        { id: 'intel-fill-bulk', label: t('driveIntel.menu.fillBulk'), icon: Users, onSelect: () => setDialog({ kind: 'fill', item: it, bulk: true }) },
      );
    }
    if (isPdf(it) && can(it.myAccess, 'DOWNLOAD')) {
      out.push({ id: 'intel-esign', label: t('driveIntel.menu.esign'), icon: PenLine, trailing: <EsignChip status={statusOf(it.id)} />, onSelect: () => setDialog({ kind: 'esign', item: it }) });
    }
    if (comparable(it) || it.version > 1) out.push({ id: 'intel-compare', label: t('driveIntel.menu.compare'), icon: FileDiff, onSelect: () => setDialog({ kind: 'compare', item: it }) });
    return out.length ? [{ kind: 'separator', id: 'intel-s' }, ...out] : [];
  };

  const toolActions = (list: DriveItem[]): ToolAction[] => {
    if (list.length !== 1) return [];
    const it = list[0];
    if (it.kind !== 'FILE' || it.virtual || !can(it.myAccess, 'DOWNLOAD')) return [];
    const out: ToolAction[] = [];
    if (isTemplateCandidate(it)) out.push({ id: 'intel-fill', icon: WandSparkles, label: t('driveIntel.menu.fill'), onClick: () => setDialog({ kind: 'fill', item: it, bulk: false }), primary: inTemplates(it) });
    if (isPdf(it)) out.push({ id: 'intel-esign', icon: PenLine, label: t('driveIntel.menu.esign'), onClick: () => setDialog({ kind: 'esign', item: it }) });
    if (it.version > 1) out.push({ id: 'intel-compare', icon: FileDiff, label: t('driveIntel.menu.compare'), onClick: () => setDialog({ kind: 'compare', item: it }) });
    return out;
  };

  /** Chip for the toolbar when exactly one file with a signature request is selected. */
  const toolbarExtra = (selected: DriveItem[]): ReactNode => (selected.length === 1 ? <EsignChip status={statusOf(selected[0].id)} /> : null);

  const searchPanel = (list: SearchItem[]): ReactNode => <SearchHits items={list} onOpenLocation={onOpenFolder} />;

  const close = () => setDialog(null);
  const changed = () => {
    void invalidateDrive(qc);
    void qc.invalidateQueries({ queryKey: intelKeys.all });
  };

  const dialogs = (
    <Suspense fallback={null}>
      {dialog?.kind === 'compare' && <CompareDialog item={dialog.item} onClose={close} />}
      {dialog?.kind === 'fill' && <FillDialog item={dialog.item} bulk={dialog.bulk} folderId={folderId} onClose={close} onCreated={changed} onOpenFolder={onOpenFolder} />}
      {dialog?.kind === 'esign' && <EsignDialog item={dialog.item} onClose={close} onSent={changed} />}
    </Suspense>
  );

  return { menuEntries, toolActions, toolbarExtra, searchPanel, dialogs, statusOf };
};

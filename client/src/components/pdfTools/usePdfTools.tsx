import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Combine, Droplets, EyeOff, FileImage, FileOutput, FilePen, Minimize2, Scissors, Stamp } from 'lucide-react';
import i18n, { registerCopy } from '@/i18n';
import { pdfToolsCopy } from '@/i18n/pagesPdfTools';
import type { MenuEntry } from '@/components/drive/ContextMenu';
import { invalidateDrive } from '@/components/drive/api';
import { can, type DriveItem } from '@/components/drive/types';
import { convertKind } from '@/components/docCreate/api';
import { editorHref, heicToJpg, isHeicItem, isHeicName, isImageItem, isPdfItem, toastToolError, toolError, uploadHeic } from './api';

registerCopy(pdfToolsCopy);

const CompressDialog = lazy(() => import('./Dialogs').then((m) => ({ default: m.CompressDialog })));
const WatermarkDialog = lazy(() => import('./Dialogs').then((m) => ({ default: m.WatermarkDialog })));
const SplitDialog = lazy(() => import('./Dialogs').then((m) => ({ default: m.SplitDialog })));
const MergeDialog = lazy(() => import('./Dialogs').then((m) => ({ default: m.MergeDialog })));

type Dialog =
  | { kind: 'compress'; items: DriveItem[]; toPdf?: boolean }
  | { kind: 'watermark'; items: DriveItem[] }
  | { kind: 'split'; item: DriveItem }
  | { kind: 'merge'; items: DriveItem[] }
  | null;

/** HEIC files the plain uploader refuses: offered for conversion (HEIC → JPG on the server) and uploaded. */
const useHeicSuggestion = (folderId: string | null, onDone: () => void) => {
  const folderRef = useRef(folderId);
  folderRef.current = folderId;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const offer = (files: File[]) => {
      const heic = files.filter((f) => isHeicName(f.name, f.type));
      const target = folderRef.current;
      if (!heic.length || !target) return;
      const t = i18n.t.bind(i18n);
      toast(t('pdfTools.heic.found', { count: heic.length, name: heic[0].name }), {
        duration: 20_000,
        action: {
          label: t('pdfTools.heic.convert'),
          onClick: () => {
            const run = async () => {
              let ok = 0;
              for (const f of heic) {
                try {
                  await uploadHeic(f, target);
                  ok++;
                } catch (err) {
                  toastToolError(err);
                }
              }
              doneRef.current();
              return ok;
            };
            toast.promise(run(), { loading: t('pdfTools.heic.converting'), success: (ok: number) => t('pdfTools.heic.done', { count: ok }), error: (e: unknown) => toolError(e) });
          },
        },
      });
    };
    const onDrop = (e: DragEvent) => offer(Array.from(e.dataTransfer?.files ?? []));
    const onChange = (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === 'file') offer(Array.from(el.files ?? []));
    };
    window.addEventListener('drop', onDrop, true);
    window.addEventListener('change', onChange, true);
    return () => {
      window.removeEventListener('drop', onDrop, true);
      window.removeEventListener('change', onChange, true);
    };
  }, []);
};

/**
 * PDF tools in the explorer: context-menu entries (editor, reduce size, watermark, redact, stamp, split, merge,
 * image → PDF, HEIC → JPG), the lazily loaded dialogs and the HEIC upload suggestion. Drive.tsx only wires
 * the pieces in (like useDriveIntel).
 */
export const usePdfTools = ({ folderId }: { folderId: string | null }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const changed = () => void invalidateDrive(qc);
  useHeicSuggestion(folderId, changed);

  const heic = async (list: DriveItem[]) => {
    try {
      const r = await heicToJpg(list.map((i) => i.id));
      const ok = r.results.filter((x) => x.ok).length;
      if (ok) toast.success(t('pdfTools.heic.menuDone', { count: ok }));
      const bad = r.results.find((x) => !x.ok);
      if (bad) toast.error(toolError(bad.error ?? 'UNKNOWN'));
      changed();
    } catch (err) {
      toastToolError(err);
    }
  };

  const menuEntries = (list: DriveItem[] | null): MenuEntry[] => {
    if (!list?.length || !list.every((i) => i.kind === 'FILE' && !i.virtual && can(i.myAccess, 'DOWNLOAD'))) return [];
    const out: MenuEntry[] = [];
    const pdfs = list.every(isPdfItem);
    const images = list.every(isImageItem);
    const heics = list.every(isHeicItem);
    if (list.length === 1) {
      const it = list[0];
      if (pdfs) {
        out.push(
          { id: 'pdf-editor', label: t('pdfTools.menu.editor'), icon: FilePen, onSelect: () => navigate(editorHref(it.id)) },
          { id: 'pdf-compress', label: t('pdfTools.menu.compress'), icon: Minimize2, onSelect: () => setDialog({ kind: 'compress', items: list }) },
          { id: 'pdf-watermark', label: t('pdfTools.menu.watermark'), icon: Droplets, onSelect: () => setDialog({ kind: 'watermark', items: list }) },
          { id: 'pdf-redact', label: t('pdfTools.menu.redact'), icon: EyeOff, onSelect: () => navigate(editorHref(it.id, 'redact')) },
          { id: 'pdf-stamp', label: t('pdfTools.menu.stamp'), icon: Stamp, onSelect: () => navigate(editorHref(it.id, 'stamp')) },
          { id: 'pdf-split', label: t('pdfTools.menu.split'), icon: Scissors, onSelect: () => setDialog({ kind: 'split', item: it }) },
        );
      }
    } else {
      const mergeable = list.every((i) => isPdfItem(i) || isImageItem(i)) && list.some(isPdfItem);
      if (mergeable && list.length <= 50) out.push({ id: 'pdf-merge', label: t('pdfTools.menu.merge'), icon: Combine, onSelect: () => setDialog({ kind: 'merge', items: list }) });
      if (pdfs && list.length <= 20) {
        out.push(
          { id: 'pdf-compress', label: t('pdfTools.menu.compress'), icon: Minimize2, onSelect: () => setDialog({ kind: 'compress', items: list }) },
          { id: 'pdf-watermark', label: t('pdfTools.menu.watermark'), icon: Droplets, onSelect: () => setDialog({ kind: 'watermark', items: list }) },
        );
      }
    }
    if (images && list.length <= 20) {
      out.push({ id: 'img-compress', label: t('pdfTools.menu.compress'), icon: Minimize2, onSelect: () => setDialog({ kind: 'compress', items: list }) });
      // JPG / PNG already have "PDF-ə çevir" from the document tools; other image types get it here.
      if (list.some((i) => !convertKind(i))) out.push({ id: 'img-topdf', label: t('pdfTools.menu.toPdf'), icon: FileOutput, onSelect: () => setDialog({ kind: 'compress', items: list, toPdf: true }) });
    }
    if (heics && list.length <= 20) out.push({ id: 'heic-jpg', label: t('pdfTools.menu.heic'), icon: FileImage, onSelect: () => void heic(list) });
    return out.length ? [{ kind: 'separator', id: 'pdf-s' }, ...out] : [];
  };

  const close = () => setDialog(null);
  const dialogs = (
    <Suspense fallback={null}>
      {dialog?.kind === 'compress' && <CompressDialog items={dialog.items} toPdf={dialog.toPdf} onClose={close} onDone={changed} />}
      {dialog?.kind === 'watermark' && <WatermarkDialog items={dialog.items} onClose={close} onDone={changed} />}
      {dialog?.kind === 'split' && <SplitDialog item={dialog.item} onClose={close} onDone={changed} />}
      {dialog?.kind === 'merge' && <MergeDialog items={dialog.items} onClose={close} onDone={changed} />}
    </Suspense>
  );

  return { menuEntries, dialogs };
};

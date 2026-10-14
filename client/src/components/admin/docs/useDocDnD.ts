import { useCallback, useRef, useState, type DragEvent } from 'react';
import type { DocFile } from '@/lib/types';

/** Custom drag type carried by file tiles / rows dragged inside the explorer. */
export const DOC_DRAG_TYPE = 'application/x-triad-docs';

interface DragPayload {
  folderId: string;
  files: DocFile[];
}

/**
 * The files currently being dragged. `dataTransfer.getData` is only readable on drop, so the payload is
 * mirrored here to decide (during dragover) whether a target can accept it.
 */
let current: DragPayload | null = null;

export const startFileDrag = (e: DragEvent, folderId: string, files: DocFile[]) => {
  current = { folderId, files };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(DOC_DRAG_TYPE, JSON.stringify({ folderId, ids: files.map((f) => f.id) }));
  e.dataTransfer.setData('text/plain', files.map((f) => f.name).join('\n'));
  if (files.length > 1) {
    // A small "N files" ghost instead of a single tile.
    const ghost = document.createElement('div');
    ghost.textContent = `${files.length} ×`;
    ghost.style.cssText =
      'position:fixed;top:-100px;left:-100px;padding:6px 12px;border-radius:9999px;background:#0b1f44;color:#fff;font:600 12px system-ui,sans-serif;box-shadow:0 8px 24px rgba(11,31,68,.3)';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 16, 16);
    window.setTimeout(() => ghost.remove(), 0);
  }
};

export const endFileDrag = () => {
  current = null;
};

export type DropKind = 'files' | 'move';

/**
 * Makes an element a drop target for OS files (upload) and for explorer files (move). Each callback is
 * optional: a target without `onMove` refuses internal drags, one without `onUpload` refuses OS files.
 * `over` says what is hovering so the caller can highlight accordingly.
 */
export const useDropTarget = ({
  path,
  enabled,
  onUpload,
  onMove,
}: {
  /** Directory this target represents; internal drags from the same directory are refused. */
  path: string;
  enabled: boolean;
  onUpload?: (files: File[], target: string) => void;
  onMove?: (files: DocFile[], target: string) => void;
}) => {
  const [over, setOver] = useState<DropKind | null>(null);
  const depth = useRef(0);

  const kindOf = useCallback(
    (e: DragEvent): DropKind | null => {
      if (!enabled) return null;
      const types = Array.from(e.dataTransfer.types);
      if (types.includes(DOC_DRAG_TYPE)) {
        if (!onMove || !current) return null;
        if (current.files.every((f) => f.path === path)) return null;
        return 'move';
      }
      if (types.includes('Files')) return onUpload ? 'files' : null;
      return null;
    },
    [enabled, onMove, onUpload, path],
  );

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      const kind = kindOf(e);
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current++;
      setOver(kind);
    },
    [kindOf],
  );

  const onDragOver = useCallback(
    (e: DragEvent) => {
      const kind = kindOf(e);
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = kind === 'move' ? 'move' : 'copy';
      if (!over) setOver(kind);
    },
    [kindOf, over],
  );

  const onDragLeave = useCallback((e: DragEvent) => {
    if (depth.current === 0) return;
    e.stopPropagation();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(null);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const kind = kindOf(e);
      depth.current = 0;
      setOver(null);
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      if (kind === 'move') {
        const files = current?.files ?? [];
        endFileDrag();
        if (files.length > 0) onMove?.(files.filter((f) => f.path !== path), path);
      } else {
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onUpload?.(files, path);
      }
    },
    [kindOf, onMove, onUpload, path],
  );

  return { over, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
};

import { useCallback, useRef, useState, type DragEvent } from 'react';
import type { DriveItem } from './types';

/** Custom drag type for items dragged inside the explorer. */
export const DRIVE_DRAG_TYPE = 'application/x-triad-drive';

/** A file picked or dropped from the OS, with the folder path it came from (folder uploads). */
export interface PickedFile {
  file: File;
  relativeDir?: string;
}

/**
 * Items being dragged. `dataTransfer.getData` is only readable on drop, so the payload is mirrored here
 * to decide during dragover whether a target accepts it.
 */
let current: DriveItem[] | null = null;

export const startItemDrag = (e: DragEvent, items: DriveItem[]) => {
  current = items;
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData(DRIVE_DRAG_TYPE, JSON.stringify(items.map((i) => i.id)));
  e.dataTransfer.setData('text/plain', items.map((i) => i.name).join('\n'));
  if (items.length > 1) {
    const ghost = document.createElement('div');
    ghost.textContent = `${items.length} ×`;
    ghost.style.cssText =
      'position:fixed;top:-100px;left:-100px;padding:6px 12px;border-radius:9999px;background:#1565e8;color:#fff;font:600 12px system-ui,sans-serif;box-shadow:0 8px 24px rgba(11,31,68,.3)';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 16, 16);
    window.setTimeout(() => ghost.remove(), 0);
  }
};

export const endItemDrag = () => {
  current = null;
};

export const draggingItems = () => current;

/** Reads dropped OS files, walking dropped folders (Chrome, Edge, Firefox, Safari all support entries). */
export const readDropped = async (dt: DataTransfer): Promise<PickedFile[]> => {
  const entries = Array.from(dt.items ?? [])
    .map((it) => (it.kind === 'file' && 'webkitGetAsEntry' in it ? it.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return Array.from(dt.files).map((file) => ({ file }));
  const out: PickedFile[] = [];
  const walk = async (entry: FileSystemEntry, dir: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ file, relativeDir: dir || undefined });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      // readEntries returns batches (≤100 in Chrome) until an empty one.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, path);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
};

export type DropKind = 'files' | 'move' | 'copy';

/** Why a drop of explorer items onto a folder is refused (null: it is accepted). */
export type DropRefusal = 'self' | 'descendant' | 'noop' | null;

/**
 * Pure check behind every drop target: never into one of the dragged items, never into a folder below a dragged
 * folder (`targetAncestors` = ids from the root down to the target's parent, when the target knows them), and a
 * move whose items all already live in the target is a no-op. The server refuses the same cases (INTO_ITSELF).
 */
export const dropRefusal = (
  items: readonly Pick<DriveItem, 'id' | 'parentId'>[],
  targetId: string,
  copy: boolean,
  targetAncestors: readonly string[] = [],
): DropRefusal => {
  if (items.some((i) => i.id === targetId)) return 'self';
  if (targetAncestors.length && items.some((i) => targetAncestors.includes(i.id))) return 'descendant';
  if (!copy && items.length > 0 && items.every((i) => i.parentId === targetId)) return 'noop';
  return null;
};

/**
 * "Geri al" after a move: the moved items go back to the folders they came from, one request per original folder.
 * Items without a parent (roots) and items that failed to move are left out.
 */
export const undoMovePlan = (items: readonly Pick<DriveItem, 'id' | 'parentId'>[], movedIds: readonly string[]) => {
  const moved = new Set(movedIds);
  const byParent = new Map<string, string[]>();
  for (const i of items) {
    if (!moved.has(i.id) || !i.parentId) continue;
    const list = byParent.get(i.parentId) ?? [];
    list.push(i.id);
    byParent.set(i.parentId, list);
  }
  return [...byParent].map(([targetId, ids]) => ({ targetId, ids }));
};

/**
 * Makes an element a drop target for OS files (upload) and explorer items (move; copy with Ctrl/⌥).
 * A target refuses internal drags of itself, of its direct children (no-op move) and, when `ancestorIds`
 * is given (sidebar tree), drags of the folders above it.
 */
export const useDropTarget = ({
  targetId,
  enabled,
  onFiles,
  onItems,
  ancestorIds,
}: {
  targetId: string;
  enabled: boolean;
  onFiles?: (files: PickedFile[], targetId: string) => void;
  onItems?: (items: DriveItem[], targetId: string, copy: boolean) => void;
  /** Ids from the root down to the target's parent. */
  ancestorIds?: readonly string[];
}) => {
  const [over, setOver] = useState<DropKind | null>(null);
  const depth = useRef(0);

  const kindOf = useCallback(
    (e: DragEvent): DropKind | null => {
      if (!enabled) return null;
      const types = Array.from(e.dataTransfer.types);
      if (types.includes(DRIVE_DRAG_TYPE)) {
        if (!onItems || !current) return null;
        const copy = e.ctrlKey || e.altKey || e.metaKey || current.some((i) => i.virtual);
        if (dropRefusal(current, targetId, copy, ancestorIds)) return null;
        return copy ? 'copy' : 'move';
      }
      if (types.includes('Files')) return onFiles ? 'files' : null;
      return null;
    },
    [enabled, onFiles, onItems, targetId, ancestorIds],
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
      if (over !== kind) setOver(kind);
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
      if (kind === 'files') {
        void readDropped(e.dataTransfer).then((files) => {
          if (files.length) onFiles?.(files, targetId);
        });
      } else {
        const items = current ?? [];
        endItemDrag();
        if (items.length) onItems?.(items, targetId, kind === 'copy');
      }
    },
    [kindOf, onFiles, onItems, targetId],
  );

  return { over, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
};

import type { QueryClient } from '@tanstack/react-query';

/** Query keys shared by the explorer page, its modals and the upload queue. */
export const docsKeys = {
  folders: ['docs-folders'] as const,
  tree: (folderId: string) => ['docs-tree', folderId] as const,
  dir: (folderId: string, path: string) => ['docs-dir', folderId, path] as const,
  companies: (folderId: string) => ['docs-companies', folderId] as const,
};

/**
 * Refreshes everything that may have changed after a mutation in `folderId`: the listed directory
 * listings, the directory tree, the companies summary and the workspace list (file counts / sizes).
 */
export const invalidateDocs = (qc: QueryClient, folderId: string, ...paths: string[]) => {
  for (const p of new Set(paths)) void qc.invalidateQueries({ queryKey: docsKeys.dir(folderId, p) });
  void qc.invalidateQueries({ queryKey: docsKeys.tree(folderId) });
  void qc.invalidateQueries({ queryKey: docsKeys.companies(folderId) });
  void qc.invalidateQueries({ queryKey: docsKeys.folders });
};

/** Invalidates every directory listing of a workspace (after a rename / structural change). */
export const invalidateAllDirs = (qc: QueryClient, folderId: string) => {
  void qc.invalidateQueries({ queryKey: ['docs-dir', folderId] });
  invalidateDocs(qc, folderId);
};

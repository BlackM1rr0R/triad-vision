import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DocEffectiveAccess, DocStructure, DocTreeResponse } from '@/lib/types';
import { docsKeys } from '@/components/admin/docs/queries';

/** One directory of the explorer tree with its sub-tree totals. */
export interface TreeNode {
  path: string;
  name: string;
  /** Friendly name for fixed directories (`Sənədlər`), the raw name otherwise; `/docs/<slug>` for the root. */
  label: string;
  depth: number;
  isRoot: boolean;
  fixed: boolean;
  /** Direct child of `<rootDir>`: a company (firm) folder. */
  company: boolean;
  /** Files directly inside. */
  files: number;
  bytes: number;
  lastUploadAt: string | null;
  /** Files / bytes / newest upload including every sub-directory. */
  totalFiles: number;
  totalBytes: number;
  lastUploadDeep: string | null;
  createdAt: string | null;
  children: TreeNode[];
}

export interface TreeModel {
  root: TreeNode;
  byPath: Map<string, TreeNode>;
  /** Company folders (children of `<rootDir>`), sorted by name. */
  companies: TreeNode[];
  access: DocEffectiveAccess;
  slug: string;
  totals: { files: number; bytes: number };
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

export const buildTreeModel = (tree: DocTreeResponse, structure: DocStructure, fixedLabel: string): TreeModel => {
  const byPath = new Map<string, TreeNode>();
  const mk = (n: { path: string; name: string; files: number; bytes: number; lastUploadAt: string | null; fixed: boolean }, createdAt: string | null): TreeNode => {
    const isRoot = n.path === '';
    const segs = isRoot ? [] : n.path.split('/');
    const node: TreeNode = {
      path: n.path,
      name: n.name,
      label: isRoot ? `/docs/${tree.folder.slug}` : n.fixed ? fixedLabel : n.name,
      depth: segs.length,
      isRoot,
      fixed: isRoot || n.fixed,
      company: segs.length === 2 && segs[0] === structure.rootDir,
      files: n.files,
      bytes: n.bytes,
      lastUploadAt: n.lastUploadAt,
      totalFiles: n.files,
      totalBytes: n.bytes,
      lastUploadDeep: n.lastUploadAt,
      createdAt,
      children: [],
    };
    byPath.set(n.path, node);
    return node;
  };
  const root = mk(tree.root, null);
  // `dirs` is sorted by path, so every parent is created before its children.
  for (const d of tree.dirs) {
    const node = mk(d, d.createdAt);
    const parent = byPath.get(d.parent) ?? root;
    parent.children.push(node);
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const finish = (node: TreeNode) => {
    node.children.sort((a, b) => collator.compare(a.name, b.name));
    for (const c of node.children) {
      finish(c);
      node.totalFiles += c.totalFiles;
      node.totalBytes += c.totalBytes;
      node.lastUploadDeep = later(node.lastUploadDeep, c.lastUploadDeep);
    }
  };
  finish(root);
  const companies = byPath.get(structure.rootDir)?.children ?? [];
  return { root, byPath, companies, access: tree.access, slug: tree.folder.slug, totals: tree.totals };
};

/** Loads `GET /docs/folders/:id/tree` and shapes it into a nested model with sub-tree totals. */
export const useDocTree = (folderId: string | null, structure: DocStructure, fixedLabel: string) => {
  const query = useQuery({
    queryKey: docsKeys.tree(folderId ?? ''),
    queryFn: async () => (await api.get<DocTreeResponse>(`/docs/folders/${folderId}/tree`)).data,
    enabled: !!folderId,
  });
  const model = useMemo(() => (query.data ? buildTreeModel(query.data, structure, fixedLabel) : null), [query.data, structure, fixedLabel]);
  return { query, model };
};

/** Every ancestor path of `path` (excluding itself), root first: 'a/b/c' → ['', 'a', 'a/b']. */
export const ancestorsOf = (path: string): string[] => {
  const out = [''];
  if (!path) return out;
  const segs = path.split('/');
  for (let i = 1; i < segs.length; i++) out.push(segs.slice(0, i).join('/'));
  return out;
};

import { prisma } from '../../db.js';
import { SECTIONS, SECTION_KEYS } from '../drive/roots.js';

/**
 * Storage report of the team drive (Admin): totals per section and per folder (recursive sums, top 50),
 * per uploader, per file type, the 50 largest files, the recycle bin, the version-history overhead and the
 * growth per month (from createdAt of the current files).
 */

const typeOf = (mime: string | null, name: string) => {
  const m = (mime ?? '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (/word|opendocument\.text|rtf/.test(m) || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'document';
  if (/sheet|excel|csv/.test(m) || ['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'spreadsheet';
  if (/presentation|powerpoint/.test(m) || ['ppt', 'pptx', 'odp'].includes(ext)) return 'presentation';
  if (/zip|rar|7z|tar|gzip/.test(m) || ['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return 'archive';
  if (m.startsWith('text/') || ['txt', 'md'].includes(ext)) return 'text';
  return 'other';
};

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export const storageReport = async () => {
  const nodes = await prisma.driveNode.findMany({
    select: { id: true, parentId: true, kind: true, name: true, size: true, mimeType: true, createdById: true, createdAt: true, deletedAt: true, space: true },
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const live = nodes.filter((n) => !n.deletedAt);
  const liveFiles = live.filter((n) => n.kind === 'FILE');

  // Recursive folder sums over live nodes.
  const folderBytes = new Map<string, number>();
  const folderFiles = new Map<string, number>();
  for (const f of liveFiles) {
    const size = f.size ?? 0;
    let p = f.parentId ? byId.get(f.parentId) : undefined;
    for (let depth = 0; p && depth < 100; depth++) {
      if (p.deletedAt) break;
      folderBytes.set(p.id, (folderBytes.get(p.id) ?? 0) + size);
      folderFiles.set(p.id, (folderFiles.get(p.id) ?? 0) + 1);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
  }
  const pathOf = (id: string) => {
    const names: string[] = [];
    let cur = byId.get(id);
    for (let depth = 0; cur && depth < 100; depth++) {
      names.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return names.join(' / ');
  };

  const sectionsRow = await prisma.setting.findUnique({ where: { key: 'drive.sections' } });
  const stored = (sectionsRow?.value ?? {}) as Record<string, unknown>;
  const archiveRow = await prisma.setting.findUnique({ where: { key: 'drive.archiveFolder' } });
  const sectionList: { key: string; id: string; name: string }[] = [];
  for (const k of SECTION_KEYS) {
    const id = stored[k];
    if (typeof id === 'string' && byId.get(id) && !byId.get(id)!.deletedAt) sectionList.push({ key: k, id, name: byId.get(id)!.name ?? SECTIONS[k].name });
  }
  const archiveId = (archiveRow?.value as { id?: unknown } | null)?.id;
  if (typeof archiveId === 'string' && byId.get(archiveId) && !byId.get(archiveId)!.deletedAt) sectionList.push({ key: 'archive', id: archiveId, name: byId.get(archiveId)!.name });
  const totalBytes = liveFiles.reduce((s, f) => s + (f.size ?? 0), 0);
  const sections = sectionList.map((s) => ({ ...s, bytes: folderBytes.get(s.id) ?? 0, files: folderFiles.get(s.id) ?? 0 }));
  const inSections = sections.reduce((s, x) => s + x.bytes, 0);
  sections.push({ key: 'other', id: '', name: '', bytes: Math.max(0, totalBytes - inSections), files: 0 });

  const roots = new Set(live.filter((n) => !n.parentId).map((n) => n.id));
  const topFolders = [...folderBytes.entries()]
    .filter(([id]) => !roots.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([id, bytes]) => ({ id, name: byId.get(id)!.name, path: pathOf(id), bytes, files: folderFiles.get(id) ?? 0 }));

  // Uploaders
  const upl = new Map<string | null, { bytes: number; files: number }>();
  for (const f of liveFiles) {
    const k = f.createdById ?? null;
    const cur = upl.get(k) ?? { bytes: 0, files: 0 };
    cur.bytes += f.size ?? 0;
    cur.files++;
    upl.set(k, cur);
  }
  const users = await prisma.user.findMany({ where: { id: { in: [...upl.keys()].filter((k): k is string => !!k) } }, select: { id: true, firstName: true, lastName: true } });
  const userName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  const byUploader = [...upl.entries()]
    .map(([id, v]) => ({ id, name: id ? (userName.get(id) ?? null) : null, ...v }))
    .sort((a, b) => b.bytes - a.bytes);

  // File types
  const types = new Map<string, { bytes: number; files: number }>();
  for (const f of liveFiles) {
    const k = typeOf(f.mimeType, f.name);
    const cur = types.get(k) ?? { bytes: 0, files: 0 };
    cur.bytes += f.size ?? 0;
    cur.files++;
    types.set(k, cur);
  }
  const byType = [...types.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.bytes - a.bytes);

  const largestFiles = [...liveFiles]
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, 50)
    .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, path: f.parentId ? pathOf(f.parentId) : '', bytes: f.size ?? 0, mimeType: f.mimeType, createdAt: f.createdAt, createdBy: f.createdById ? (userName.get(f.createdById) ?? null) : null }));

  // Recycle bin (current files + their versions) and version overhead
  const trashedIds = nodes.filter((n) => n.deletedAt && n.kind === 'FILE').map((n) => n.id);
  const trashedSet = new Set(trashedIds);
  const versions = await prisma.driveFileVersion.findMany({ select: { nodeId: true, size: true } });
  let versionsLive = 0;
  let versionsTrash = 0;
  for (const v of versions) {
    if (trashedSet.has(v.nodeId)) versionsTrash += v.size;
    else versionsLive += v.size;
  }
  const trashFiles = nodes.filter((n) => n.deletedAt && n.kind === 'FILE');
  const trash = { files: trashFiles.length, bytes: trashFiles.reduce((s, f) => s + (f.size ?? 0), 0) + versionsTrash };

  // Growth per month (last 24 months, live files by createdAt)
  const growthMap = new Map<string, { bytes: number; files: number }>();
  for (const f of liveFiles) {
    const k = monthKey(f.createdAt);
    const cur = growthMap.get(k) ?? { bytes: 0, files: 0 };
    cur.bytes += f.size ?? 0;
    cur.files++;
    growthMap.set(k, cur);
  }
  const growth: { month: string; bytes: number; files: number }[] = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const k = monthKey(d);
    growth.push({ month: k, ...(growthMap.get(k) ?? { bytes: 0, files: 0 }) });
  }

  return {
    generatedAt: now,
    totals: { bytes: totalBytes, files: liveFiles.length, folders: live.filter((n) => n.kind === 'FOLDER').length, versionsBytes: versionsLive, versions: versions.length, trashBytes: trash.bytes, allBytes: totalBytes + versionsLive + trash.bytes },
    sections,
    topFolders,
    byUploader,
    byType,
    largestFiles,
    trash,
    versions: { bytes: versionsLive, count: versions.length - versions.filter((v) => trashedSet.has(v.nodeId)).length },
    growth,
  };
};

import type { TFunction } from 'i18next';
import type { ActivityRow } from './api';

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Who did it: the staff member, "Outside person (label)" for uploads via a link, else "unknown". */
export const activityActor = (row: ActivityRow, t: TFunction) => {
  if (row.actor) return `${row.actor.firstName} ${row.actor.lastName}`.trim();
  if (row.action === 'UPLOAD_VIA_LINK') {
    const label = str(row.meta?.label);
    return label ? t('driveCollab.activity.outsider', { label }) : t('driveCollab.activity.outsiderNoLabel');
  }
  return t('driveCollab.activity.someone');
};

/** One human sentence per journal row: "Ilqar «pasport.pdf» faylını «Erstdokumente» qovluğuna köçürdü". */
export const activitySentence = (row: ActivityRow, t: TFunction) => {
  const meta = row.meta ?? {};
  const kind = str(meta.kind) || row.node?.kind || 'FILE';
  const number = typeof meta.number === 'number' ? meta.number : null;
  const params = {
    actor: activityActor(row, t),
    name: row.name,
    from: str(meta.from) || str(meta.fromName),
    to: str(meta.toName),
    version: str(meta.version),
    task: number ? `T-${String(number).padStart(4, '0')}` : '',
    interpolation: { escapeValue: false },
  };
  const key = `driveCollab.sentence.${row.action}`;
  if (!t(key, { defaultValue: '' })) return t('driveCollab.sentence.other', params);
  return kind === 'FOLDER' ? t(key, { ...params, context: 'folder' }) : t(key, params);
};

const pad2 = (n: number) => String(n).padStart(2, '0');
export const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** Where a journal row's item opens in the explorer (null when it is gone). */
export const activityHref = (row: ActivityRow) => {
  if (!row.nodeId || !row.node || row.node.deleted) return null;
  if (row.node.kind === 'FOLDER') return `/workspace/drive/f/${encodeURIComponent(row.nodeId)}`;
  if (!row.node.parentId) return null;
  return `/workspace/drive/f/${encodeURIComponent(row.node.parentId)}?${new URLSearchParams({ item: row.nodeId })}`;
};

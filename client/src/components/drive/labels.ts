import type { TFunction } from 'i18next';
import { stageLabel } from '@/components/admin/labels';
import type { DocStage } from '@/lib/types';
import { fileKind } from './fileIcons';
import type { Crumb, DriveItem } from './types';

/** Display name of a node: system roots are translated by space, stage folders by stage. */
export const rootLabel = (item: Pick<DriveItem, 'space' | 'system' | 'parentId' | 'name' | 'ownerId'>, t: TFunction, myId?: string) => {
  if (item.system && !item.parentId) {
    if (item.space === 'PERSONAL') return myId && item.ownerId !== myId ? item.name : String(t('drive.roots.PERSONAL'));
    return String(t(`drive.roots.${item.space}`));
  }
  return item.name;
};

export const displayName = (item: DriveItem, t: TFunction, myId?: string) => {
  if (item.virtual && item.stage && item.kind === 'FOLDER') return stageLabel(item.stage as DocStage);
  return rootLabel(item, t, myId);
};

export const crumbLabel = (c: Crumb, t: TFunction, myId?: string) => {
  if (c.system && c.space !== 'PERSONAL') return String(t(`drive.roots.${c.space}`));
  if (c.system && c.space === 'PERSONAL') return myId && c.ownerId !== myId ? c.name : String(t('drive.roots.PERSONAL'));
  if (/^case:[a-z0-9]+:[A-Z_]+$/.test(c.id)) return stageLabel(c.name as DocStage);
  return c.name;
};

export const typeLabel = (item: DriveItem, t: TFunction) => {
  if (item.virtual && item.kind === 'FOLDER') return String(t(item.stage ? 'drive.types.stage' : item.caseId ? 'drive.types.caseFolder' : 'drive.types.folder'));
  return String(t(`drive.types.${fileKind(item)}`));
};

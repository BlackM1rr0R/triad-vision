import type { TFunction } from 'i18next';
import { stageLabel } from '@/components/admin/labels';
import type { DocStage } from '@/lib/types';
import { fileKind } from './fileIcons';
import type { Crumb, DriveItem } from './types';

/** Stage folders of a case are named in German, like every folder in the drive. */
const STAGE_FOLDER_DE: Record<string, string> = {
  INITIAL: 'Erstdokumente',
  EMBASSY: 'Botschaftsunterlagen',
  CONTRACT: 'Vertrag',
  CONTRACT_SIGNED: 'Unterschriebener Vertrag',
  VISA: 'Visum',
  OTHER: 'Sonstiges',
};
const stageFolder = (stage: string) => STAGE_FOLDER_DE[stage] ?? stageLabel(stage as DocStage);

/** Display name of a node: system roots are translated by space, stage folders by stage. */
export const rootLabel = (item: Pick<DriveItem, 'space' | 'system' | 'parentId' | 'name' | 'ownerId'>, t: TFunction, myId?: string) => {
  if (item.system && !item.parentId) {
    if (item.space === 'PERSONAL') return myId && item.ownerId !== myId ? item.name : String(t('drive.roots.PERSONAL'));
    return String(t(`drive.roots.${item.space}`));
  }
  return item.name;
};

export const displayName = (item: DriveItem, t: TFunction, myId?: string) => {
  if (item.virtual && item.stage && item.kind === 'FOLDER') return stageFolder(item.stage);
  return rootLabel(item, t, myId);
};

export const crumbLabel = (c: Crumb, t: TFunction, myId?: string) => {
  if (c.system && c.space !== 'PERSONAL') return String(t(`drive.roots.${c.space}`));
  if (c.system && c.space === 'PERSONAL') return myId && c.ownerId !== myId ? c.name : String(t('drive.roots.PERSONAL'));
  if (/^case:[a-z0-9]+:[A-Z_]+$/.test(c.id)) return stageFolder(c.name);
  return c.name;
};

export const typeLabel = (item: DriveItem, t: TFunction) => {
  if (item.virtual && item.kind === 'FOLDER') return String(t(item.stage ? 'drive.types.stage' : item.caseId ? 'drive.types.caseFolder' : 'drive.types.folder'));
  return String(t(`drive.types.${fileKind(item)}`));
};

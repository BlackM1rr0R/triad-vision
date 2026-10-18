import type { TFunction } from 'i18next';
import { fileKind } from './fileIcons';
import type { Crumb, DriveItem } from './types';

/**
 * Display name of a node. Every folder name is German and shown as it is — the shared root
 * "Gemeinsame Dokumente" too (the same label in every language; the subtitle explains it).
 */
export const rootLabel = (item: Pick<DriveItem, 'space' | 'system' | 'parentId' | 'name' | 'ownerId'>, t: TFunction, _myId?: string) =>
  item.system && !item.parentId ? String(t('drive.shared.title')) : item.name;

export const displayName = (item: DriveItem, t: TFunction, myId?: string) => rootLabel(item, t, myId);

export const crumbLabel = (c: Crumb, _t: TFunction, _myId?: string) => c.name;

export const typeLabel = (item: DriveItem, t: TFunction) => {
  if (item.kind === 'FOLDER' && item.caseId) return String(t('drive.types.caseFolder'));
  return String(t(`drive.types.${fileKind(item)}`));
};

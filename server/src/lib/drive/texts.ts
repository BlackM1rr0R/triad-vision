import type { DriveAccess, Locale } from '@prisma/client';

/** Notification texts of the drive, in the recipient's language. */

/** "you can …" phrase per level, conjugated for the formal "you" of each language. */
const LEVEL: Record<Locale, Record<DriveAccess, string>> = {
  az: { VIEW: 'baxa bilərsiniz', DOWNLOAD: 'faylları endirə bilərsiniz', EXPORT: 'hamısını endirə bilərsiniz', EDIT: 'redaktə edə bilərsiniz', MANAGE: 'idarə edə bilərsiniz' },
  de: { VIEW: 'Sie können ansehen', DOWNLOAD: 'Sie können Dateien herunterladen', EXPORT: 'Sie können alles herunterladen', EDIT: 'Sie können bearbeiten', MANAGE: 'Sie können verwalten' },
  en: { VIEW: 'you can view', DOWNLOAD: 'you can download files', EXPORT: 'you can download everything', EDIT: 'you can edit', MANAGE: 'you can manage' },
  ru: { VIEW: 'вы можете просматривать', DOWNLOAD: 'вы можете скачивать файлы', EXPORT: 'вы можете скачать всё', EDIT: 'вы можете редактировать', MANAGE: 'вы можете управлять' },
};

export const sharedText = (locale: Locale, p: { by: string; name: string; access: DriveAccess; folder: boolean }) => {
  const level = LEVEL[locale][p.access];
  switch (locale) {
    case 'de':
      return {
        title: p.folder ? `${p.by} hat einen Ordner mit Ihnen geteilt` : `${p.by} hat eine Datei mit Ihnen geteilt`,
        body: `„${p.name}“ – ${level}.`,
        cta: p.folder ? 'Ordner öffnen' : 'Datei öffnen',
      };
    case 'en':
      return {
        title: p.folder ? `${p.by} shared a folder with you` : `${p.by} shared a file with you`,
        body: `"${p.name}" – ${level}.`,
        cta: p.folder ? 'Open folder' : 'Open file',
      };
    case 'ru':
      return {
        title: p.folder ? `${p.by} открыл(а) вам доступ к папке` : `${p.by} открыл(а) вам доступ к файлу`,
        body: `«${p.name}» – ${level}.`,
        cta: p.folder ? 'Открыть папку' : 'Открыть файл',
      };
    default:
      return {
        title: p.folder ? `${p.by} sizinlə qovluq paylaşdı` : `${p.by} sizinlə fayl paylaşdı`,
        body: `"${p.name}" – ${level}.`,
        cta: p.folder ? 'Qovluğu aç' : 'Faylı aç',
      };
  }
};

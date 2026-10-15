import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  FolderLock,
  FolderOpen,
  HardDrive,
  Layers,
  Presentation,
  User,
} from 'lucide-react';
import type { DriveItem, FolderColor } from './types';

export type FileKind = 'folder' | 'pdf' | 'word' | 'excel' | 'presentation' | 'image' | 'archive' | 'text' | 'file';

const EXT: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  odt: 'word',
  rtf: 'word',
  xls: 'excel',
  xlsx: 'excel',
  ods: 'excel',
  csv: 'excel',
  ppt: 'presentation',
  pptx: 'presentation',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  gif: 'image',
  avif: 'image',
  zip: 'archive',
  txt: 'text',
  md: 'text',
  log: 'text',
};

export const fileKind = (item: Pick<DriveItem, 'kind' | 'mimeType' | 'name'>): FileKind => {
  if (item.kind === 'FOLDER') return 'folder';
  const m = item.mimeType ?? '';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.includes('wordprocessing') || m === 'application/msword' || m.includes('opendocument.text') || m.includes('rtf')) return 'word';
  if (m.includes('spreadsheet') || m === 'application/vnd.ms-excel' || m === 'text/csv') return 'excel';
  if (m.includes('presentation') || m === 'application/vnd.ms-powerpoint') return 'presentation';
  if (m.includes('zip')) return 'archive';
  if (m.startsWith('text/')) return 'text';
  const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT[ext] ?? 'file';
};

const FILE_ICON: Record<FileKind, { icon: LucideIcon; tone: string; bg: string }> = {
  folder: { icon: Folder, tone: 'text-amber-400', bg: 'bg-amber-50' },
  pdf: { icon: FileText, tone: 'text-red-500', bg: 'bg-red-50' },
  word: { icon: FileType2, tone: 'text-blue-600', bg: 'bg-blue-50' },
  excel: { icon: FileSpreadsheet, tone: 'text-emerald-600', bg: 'bg-emerald-50' },
  presentation: { icon: Presentation, tone: 'text-orange-500', bg: 'bg-orange-50' },
  image: { icon: FileImage, tone: 'text-violet-500', bg: 'bg-violet-50' },
  archive: { icon: FileArchive, tone: 'text-amber-600', bg: 'bg-amber-50' },
  text: { icon: FileText, tone: 'text-slate-500', bg: 'bg-slate-100' },
  file: { icon: File, tone: 'text-slate-400', bg: 'bg-slate-100' },
};

export const FOLDER_TONE: Record<FolderColor, string> = {
  blue: 'text-sky-500',
  green: 'text-emerald-500',
  amber: 'text-amber-400',
  red: 'text-rose-500',
  violet: 'text-violet-500',
  pink: 'text-pink-400',
  teal: 'text-teal-500',
  slate: 'text-slate-400',
};

/** Swatch colours for the colour picker (background). */
export const FOLDER_SWATCH: Record<FolderColor, string> = {
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  red: 'bg-rose-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-400',
  teal: 'bg-teal-500',
  slate: 'bg-slate-400',
};

/** The icon of a drive item: coloured folders, special icons for roots and case folders, file types by MIME. */
export const ItemIcon = ({ item, open = false, className }: { item: DriveItem; open?: boolean; className?: string }) => {
  if (item.kind === 'FOLDER') {
    if (item.system && !item.parentId) {
      const Icon = item.space === 'SHARED' ? HardDrive : item.space === 'CASES' ? Briefcase : User;
      const tone = item.space === 'SHARED' ? 'text-brand-600' : item.space === 'CASES' ? 'text-violet-600' : 'text-teal-600';
      return <Icon className={clsx(tone, className)} strokeWidth={1.6} aria-hidden />;
    }
    if (item.virtual && item.id.startsWith('case:') && !item.stage) return <Briefcase className={clsx('text-violet-500', className)} strokeWidth={1.5} aria-hidden />;
    if (item.virtual && item.stage) return <Layers className={clsx('text-violet-400', className)} strokeWidth={1.5} aria-hidden />;
    const Icon = !item.inheritPermissions ? FolderLock : open ? FolderOpen : Folder;
    return <Icon className={clsx(item.color ? FOLDER_TONE[item.color] : 'text-amber-400', className)} fill="currentColor" fillOpacity={0.22} strokeWidth={1.5} aria-hidden />;
  }
  const k = FILE_ICON[fileKind(item)];
  return <k.icon className={clsx(k.tone, className)} strokeWidth={1.5} aria-hidden />;
};

export const fileTone = (item: DriveItem) => FILE_ICON[fileKind(item)];

/** Extension in upper case, for tiles ("PDF", "DOCX"). */
export const extLabel = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 5) : '';
};

import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  LayoutTemplate,
  Sheet,
  FileType2,
  ClipboardList,
  Folder,
  FolderLock,
  FolderOpen,
  Handshake,
  HardDrive,
  Presentation,
  Users,
} from 'lucide-react';
import type { DriveItem, FolderColor, SectionKey } from './types';

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

interface SectionInfo {
  icon: LucideIcon;
  tone: string;
  bg: string;
  desc: string;
}

/** Icons of the sections of "Gemeinsame Dokumente", by section key. */
export const SECTION_INFO: Record<SectionKey, SectionInfo> = {
  cases: { icon: Briefcase, tone: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-500/10', desc: 'drive.sections.cases' },
  partners: { icon: Handshake, tone: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-500/10', desc: 'drive.sections.partners' },
  staff: { icon: Users, tone: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-500/10', desc: 'drive.sections.staff' },
  templates: { icon: LayoutTemplate, tone: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-500/10', desc: 'drive.sections.templates' },
  clients: { icon: Sheet, tone: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10', desc: 'drive.sections.clients' },
  tasks: { icon: ClipboardList, tone: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-500/10', desc: 'drive.sections.tasks' },
};

/** Default German names of the sections (fallback before the section ids are known). */
const SECTION_BY_NAME: Record<string, SectionKey> = {
  Anträge: 'cases',
  Partner: 'partners',
  Mitarbeiter: 'staff',
  Vorlagen: 'templates',
  'Alle Kunden': 'clients',
  Aufgabendateien: 'tasks',
};

/** Section ids from /drive/roots (sections are recognised by id, so a renamed section keeps its icon). */
let sectionIds = new Map<string, SectionKey>();
export const setSectionIds = (map: Partial<Record<SectionKey, string>> | undefined) => {
  sectionIds = new Map(Object.entries(map ?? {}).map(([k, id]) => [id as string, k as SectionKey]));
};

/** The section info of a section folder (null for any other folder). */
export const sectionOf = (item: Pick<DriveItem, 'id' | 'system' | 'name' | 'parentId'> | null | undefined): SectionInfo | null => {
  if (!item || !item.system || !item.parentId) return null;
  const key = sectionIds.get(item.id) ?? (sectionIds.size === 0 ? SECTION_BY_NAME[item.name] : undefined);
  return key ? SECTION_INFO[key] : null;
};

/** The icon of a drive item: coloured folders, special icons for roots and case folders, file types by MIME. */
export const ItemIcon = ({ item, open = false, className }: { item: DriveItem; open?: boolean; className?: string }) => {
  if (item.kind === 'FOLDER') {
    if (item.system && !item.parentId) return <HardDrive className={clsx('text-brand-600', className)} strokeWidth={1.6} aria-hidden />;
    // The system sections of the shared workspace.
    const section = sectionOf(item);
    if (section) return <section.icon className={clsx(section.tone, className)} strokeWidth={1.6} aria-hidden />;
    const Icon = !item.inheritPermissions ? FolderLock : open ? FolderOpen : Folder;
    // Client folders (linked to a case) are violet unless staff picked a colour.
    const tone = item.color ? FOLDER_TONE[item.color] : item.caseId ? 'text-violet-500' : 'text-amber-400';
    return <Icon className={clsx(tone, className)} fill="currentColor" fillOpacity={0.22} strokeWidth={1.5} aria-hidden />;
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

import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui';
import { uploadFile } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { openDocument } from '@/lib/native';
import { useErrorMessage } from '@/lib/queries';
import type { CaseDocument } from '@/types';
import { showQualityFeedback } from './qualityFeedback';

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const ACCEPTED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const mimeFromName = (name: string, fallback?: string | null) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return fallback && fallback !== 'application/octet-stream' ? fallback : EXT_MIME[ext] ?? fallback ?? 'application/octet-stream';
};

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number | null;
}

export type PickSource = 'camera' | 'gallery' | 'files';

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/** Opens the camera, the photo library or the document picker. Returns null when cancelled. */
export const pickFile = async (source: PickSource, opts: { pdfOnly?: boolean } = {}): Promise<PickedFile | null> => {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new ApiError(0, 'CAMERA_DENIED');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75, exif: false });
    if (res.canceled || !res.assets[0]) return null;
    const a = res.assets[0];
    return { uri: a.uri, name: a.fileName || `photo-${stamp()}.jpg`, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize };
  }
  if (source === 'gallery') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.accessPrivileges !== 'limited') throw new ApiError(0, 'PHOTOS_DENIED');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, exif: false });
    if (res.canceled || !res.assets[0]) return null;
    const a = res.assets[0];
    // quality < 1 makes iOS re-encode HEIC photos as JPEG.
    const name = (a.fileName || `image-${stamp()}.jpg`).replace(/\.heic$/i, '.jpg');
    return { uri: a.uri, name, mimeType: a.mimeType === 'image/heic' ? 'image/jpeg' : a.mimeType || mimeFromName(name), size: a.fileSize };
  }
  const res = await DocumentPicker.getDocumentAsync({
    type: opts.pdfOnly ? ['application/pdf'] : ACCEPTED_MIME,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name, mimeType: mimeFromName(a.name, a.mimeType), size: a.size };
};

export const validateFile = (f: PickedFile, opts: { pdfOnly?: boolean } = {}): string | null => {
  if (f.size && f.size > MAX_FILE_SIZE) return 'FILE_TOO_LARGE';
  if (opts.pdfOnly && f.mimeType !== 'application/pdf') return 'CONTRACT_MUST_BE_PDF';
  if (!ACCEPTED_MIME.includes(f.mimeType)) return 'UNSUPPORTED_FILE_TYPE';
  return null;
};

/** Upload state + helpers for one screen. `progress` is keyed by requirement id. */
export const useUploader = (invalidate: () => Promise<unknown>) => {
  const { t } = useTranslation();
  const toast = useToast();
  const message = useErrorMessage();
  const [progress, setProgress] = useState<Record<string, number>>({});
  // "Retake" in the quality alert runs the same upload again (same requirement, same source).
  const again = useRef<(() => void) | null>(null);

  const upload = useCallback(
    async (
      key: string,
      path: string,
      source: PickSource,
      fields: Record<string, string>,
      opts: { pdfOnly?: boolean; successMessage?: string; onUploaded?: (doc: CaseDocument | null, file: PickedFile) => void } = {},
    ) => {
      try {
        const file = await pickFile(source, opts);
        if (!file) return false;
        const invalid = validateFile(file, opts);
        if (invalid) throw new ApiError(0, invalid);
        setProgress((p) => ({ ...p, [key]: 0 }));
        const res = await uploadFile({
          path,
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType,
          fields,
          onProgress: (f) => setProgress((p) => ({ ...p, [key]: f })),
        });
        await invalidate();
        // Scan quality measured by the server (blur, darkness, glare, cut-off): an alert with "Retake".
        if (!showQualityFeedback(t, res, () => again.current?.())) toast(opts.successMessage ?? t('m.case.uploaded'));
        opts.onUploaded?.((res as { document?: CaseDocument } | null)?.document ?? null, file);
        return true;
      } catch (err) {
        toast(message(err), 'error');
        return false;
      } finally {
        setProgress((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
      }
    },
    [invalidate, message, t, toast],
  );
  const uploadWithRetake: typeof upload = useCallback(
    (key, path, source, fields, opts = {}) => {
      again.current = () => void upload(key, path, source, fields, opts);
      return upload(key, path, source, fields, opts);
    },
    [upload],
  );

  /**
   * Uploads several already-prepared files one after the other for the same requirement (scanner
   * pages). Each source is produced lazily right before its upload so only one rendered page lives
   * in memory at a time. Resolves with the created documents, or null when something failed (the
   * error was shown; pages uploaded before the failure stay on the server).
   */
  const uploadFiles = useCallback(
    async (
      key: string,
      path: string,
      sources: (() => Promise<PickedFile>)[],
      fields: Record<string, string>,
      onPage?: (page: number, fraction: number) => void,
    ): Promise<CaseDocument[] | null> => {
      const docs: CaseDocument[] = [];
      setProgress((p) => ({ ...p, [key]: 0 }));
      try {
        for (let i = 0; i < sources.length; i++) {
          onPage?.(i + 1, 0);
          const file = await sources[i]();
          const invalid = validateFile(file);
          if (invalid) throw new ApiError(0, invalid);
          const res = await uploadFile({
            path,
            uri: file.uri,
            name: file.name,
            mimeType: file.mimeType,
            fields,
            onProgress: (f) => {
              onPage?.(i + 1, f);
              setProgress((p) => ({ ...p, [key]: (i + f) / sources.length }));
            },
          });
          const doc = (res as { document?: CaseDocument } | null)?.document;
          if (doc) docs.push(doc);
        }
        await invalidate();
        toast(sources.length > 1 ? t('m.scan.done', { count: sources.length }) : t('m.case.uploaded'));
        return docs;
      } catch (err) {
        toast(message(err), 'error');
        if (docs.length) await invalidate();
        return null;
      } finally {
        setProgress((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
      }
    },
    [invalidate, message, t, toast],
  );

  return { progress, upload: uploadWithRetake, uploadFiles };
};

/** Images open in the in-app viewer; PDFs / Word files open in the phone's viewer. */
export const useOpenDocument = () => {
  const toast = useToast();
  const message = useErrorMessage();
  const { t } = useTranslation();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const open = useCallback(
    async (doc: Pick<CaseDocument, 'id' | 'originalName' | 'mimeType'>) => {
      if (doc.mimeType.startsWith('image/')) {
        router.push({ pathname: '/viewer', params: { id: doc.id, name: doc.originalName, mime: doc.mimeType } });
        return;
      }
      setOpeningId(doc.id);
      try {
        await openDocument(doc);
      } catch (err) {
        toast(message(err) || t('m.errors.DOWNLOAD_FAILED'), 'error');
      } finally {
        setOpeningId(null);
      }
    },
    [message, t, toast],
  );
  return { open, openingId };
};

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '@/i18n';
import { api, errorCode } from '@/lib/api';
import type { DocFile } from '@/lib/types';
import { errorMessage } from '@/components/admin/labels';
import { invalidateDocs } from '@/components/admin/docs/queries';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

/** Extensions the workspace accepts (mirrors server/src/lib/fileCheck.ts WORKSPACE_MIME). */
export const ACCEPTED_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods',
  '.csv', '.txt', '.md', '.log', '.rtf', '.zip',
];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
};

/** Messages are resolved at upload time in the language active then. */
const t = (key: string, opts?: Record<string, unknown>) => String(i18n.t(`admin.docs.upload.${key}`, opts));

export interface UploadItem {
  id: number;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'error' | 'skipped';
  progress: number;
  error?: string;
}

export interface UploadResult {
  /** Directory the files were sent to. */
  path: string;
  uploaded: number;
}

/**
 * Sequential upload queue. Files go to `path` (the directory being browsed) unless `enqueue` is given
 * another target directory. When a file with the same name exists the server answers 409 FILE_EXISTS;
 * `askReplace` is then awaited (a confirm dialog) and the upload is retried with `replace=true` on yes.
 */
export const useUpload = (folderId: string | null, path: string, askReplace: (name: string) => Promise<boolean>) => {
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const askRef = useRef(askReplace);
  askRef.current = askReplace;

  const patch = (id: number, p: Partial<UploadItem>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const uploadOne = async (item: UploadItem, target: string, replace: boolean): Promise<void> => {
    const fd = new FormData();
    fd.append('path', target);
    if (replace) fd.append('replace', 'true');
    fd.append('file', item.file);
    await api.post<{ file: DocFile }>(`/docs/folders/${folderId}/files`, fd, {
      onUploadProgress: (e) => patch(item.id, { progress: e.total ? Math.round((e.loaded / e.total) * 100) : 0 }),
    });
  };

  const enqueue = useCallback(
    async (files: File[], targetPath?: string): Promise<UploadResult> => {
      const target = targetPath ?? path;
      if (!folderId || files.length === 0) return { path: target, uploaded: 0 };
      const fresh: UploadItem[] = files.map((file) => ({ id: ++seq.current, file, status: 'queued', progress: 0 }));
      setItems((list) => [...list.filter((x) => x.status === 'uploading' || x.status === 'queued'), ...fresh]);
      setBusy(true);
      let uploaded = 0;
      for (const item of fresh) {
        if (item.file.size > MAX_UPLOAD_BYTES) {
          patch(item.id, { status: 'error', error: t('tooLarge', { mb: MAX_UPLOAD_MB }) });
          continue;
        }
        if (!ACCEPTED_EXTENSIONS.includes(extOf(item.file.name))) {
          patch(item.id, { status: 'error', error: t('unsupported') });
          continue;
        }
        patch(item.id, { status: 'uploading' });
        try {
          await uploadOne(item, target, false);
          patch(item.id, { status: 'done', progress: 100 });
          uploaded++;
        } catch (err) {
          if (errorCode(err) === 'FILE_EXISTS') {
            const yes = await askRef.current(item.file.name);
            if (!yes) {
              patch(item.id, { status: 'skipped', error: t('kept') });
              continue;
            }
            try {
              patch(item.id, { progress: 0 });
              await uploadOne(item, target, true);
              patch(item.id, { status: 'done', progress: 100 });
              uploaded++;
            } catch (err2) {
              patch(item.id, { status: 'error', error: errorMessage(err2, t('failed')) });
            }
          } else {
            patch(item.id, { status: 'error', error: errorMessage(err, t('failed')) });
          }
        }
      }
      setBusy(false);
      if (uploaded > 0) invalidateDocs(qc, folderId, target);
      return { path: target, uploaded };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folderId, path, qc],
  );

  const clearFinished = useCallback(() => setItems((list) => list.filter((x) => x.status === 'uploading' || x.status === 'queued')), []);

  return { items, busy, enqueue, clearFinished };
};

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { api, errorCode } from '@/lib/api';
import { driveError, invalidateDrive } from './api';
import type { PickedFile } from './dnd';
import type { DriveItem } from './types';

/** Extensions the drive accepts (mirrors server/src/lib/fileCheck.ts WORKSPACE_MIME). */
export const ACCEPTED_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.heic', '.heif',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods',
  '.csv', '.txt', '.md', '.log', '.rtf', '.zip',
];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
};

const t = (key: string, opts?: Record<string, unknown>) => String(i18n.t(`drive.upload.${key}`, opts));

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled' | 'skipped';

export interface UploadTask {
  id: number;
  file: File;
  targetId: string;
  relativeDir?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

export type ConflictChoice = 'replace' | 'rename' | 'skip';
export type AskConflict = (name: string) => Promise<{ choice: ConflictChoice; all: boolean }>;

/** Server answer of one upload (duplicates: same content elsewhere, see components/drive/org). */
export interface UploadResult {
  item: DriveItem;
  replaced: boolean;
  duplicates?: { id: string; name: string; path: string; folderId: string | null; folderName: string | null }[];
  originalName?: string;
}

export interface UploadOptions {
  /** Called after every successful upload. */
  onUploaded?: (result: UploadResult) => void;
  /** Extra form fields sent with each file (e.g. the "Sənəd növü" of the upload panel). */
  extraFields?: () => Record<string, string | undefined>;
}

/**
 * Sequential upload queue with per-file progress and cancel. A name clash answers 409 NAME_EXISTS;
 * the user is then asked (replace as a new version / keep both / skip, optionally for all the rest)
 * and the file is sent again with that choice.
 */
export const useUploads = (maxBytes: number, askConflict: AskConflict, options: UploadOptions = {}) => {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const qc = useQueryClient();
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const queue = useRef<UploadTask[]>([]);
  const running = useRef(false);
  const seq = useRef(0);
  const controllers = useRef(new Map<number, AbortController>());
  const cancelled = useRef(new Set<number>());
  const policy = useRef<ConflictChoice | null>(null);
  const askRef = useRef(askConflict);
  askRef.current = askConflict;

  const patch = (id: number, p: Partial<UploadTask>) => setTasks((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const send = async (task: UploadTask, onConflict: 'fail' | ConflictChoice) => {
    const fd = new FormData();
    fd.append('onConflict', onConflict === 'skip' ? 'fail' : onConflict);
    if (task.relativeDir) fd.append('relativeDir', task.relativeDir);
    for (const [k, v] of Object.entries(optionsRef.current.extraFields?.() ?? {})) if (v) fd.append(k, v);
    fd.append('file', task.file);
    const ctrl = new AbortController();
    controllers.current.set(task.id, ctrl);
    try {
      const res = await api.post<UploadResult>(`/drive/nodes/${encodeURIComponent(task.targetId)}/files`, fd, {
        signal: ctrl.signal,
        onUploadProgress: (e) => patch(task.id, { progress: e.total ? Math.round((e.loaded / e.total) * 100) : 0 }),
      });
      optionsRef.current.onUploaded?.(res.data);
    } finally {
      controllers.current.delete(task.id);
    }
  };

  const run = async () => {
    if (running.current) return;
    running.current = true;
    let uploaded = 0;
    let sinceRefresh = 0;
    while (queue.current.length) {
      const task = queue.current.shift()!;
      if (cancelled.current.has(task.id)) continue;
      patch(task.id, { status: 'uploading', progress: 0 });
      try {
        try {
          await send(task, policy.current ?? 'fail');
        } catch (err) {
          if (errorCode(err) !== 'NAME_EXISTS') throw err;
          let choice = policy.current;
          if (!choice) {
            const answer = await askRef.current(task.file.name);
            choice = answer.choice;
            if (answer.all) policy.current = choice;
          }
          if (choice === 'skip') {
            patch(task.id, { status: 'skipped', progress: 0 });
            continue;
          }
          patch(task.id, { progress: 0 });
          await send(task, choice);
        }
        patch(task.id, { status: 'done', progress: 100 });
        uploaded++;
        if (++sinceRefresh >= 10) {
          sinceRefresh = 0;
          void invalidateDrive(qc);
        }
      } catch (err) {
        if (cancelled.current.has(task.id) || (err as { name?: string })?.name === 'CanceledError') patch(task.id, { status: 'cancelled' });
        else patch(task.id, { status: 'error', error: driveError(err) });
      }
    }
    running.current = false;
    policy.current = null;
    if (uploaded > 0) {
      void invalidateDrive(qc);
      toast.success(t('uploaded', { count: uploaded }));
    }
  };

  const enqueue = useCallback(
    (files: PickedFile[], targetId: string) => {
      const fresh: UploadTask[] = files.map(({ file, relativeDir }) => {
        const id = ++seq.current;
        const tooBig = file.size > maxBytes;
        const unsupported = !ACCEPTED_EXTENSIONS.includes(extOf(file.name));
        return {
          id,
          file,
          targetId,
          relativeDir,
          status: tooBig || unsupported ? 'error' : 'queued',
          progress: 0,
          error: tooBig ? t('tooLarge', { mb: Math.round(maxBytes / 1024 / 1024) }) : unsupported ? t('unsupported') : undefined,
        };
      });
      setTasks((list) => [...list, ...fresh]);
      queue.current.push(...fresh.filter((f) => f.status === 'queued'));
      void run();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxBytes],
  );

  const cancel = useCallback((id: number) => {
    cancelled.current.add(id);
    controllers.current.get(id)?.abort();
    setTasks((list) => list.map((x) => (x.id === id && (x.status === 'queued' || x.status === 'uploading') ? { ...x, status: 'cancelled' } : x)));
  }, []);

  const cancelAll = useCallback(() => {
    for (const x of tasksRef.current) if (x.status === 'queued' || x.status === 'uploading') cancel(x.id);
  }, [cancel]);

  const clearFinished = useCallback(() => setTasks((list) => list.filter((x) => x.status === 'queued' || x.status === 'uploading')), []);

  return { tasks, enqueue, cancel, cancelAll, clearFinished, busy: tasks.some((x) => x.status === 'queued' || x.status === 'uploading') };
};

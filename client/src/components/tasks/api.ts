import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CaseRef, ChecklistItem, Person, TaskDetail, TaskListResponse } from './types';
import { optimizeImage } from '@/lib/imageCompress';
import { delayedCommit } from '@/lib/undo';

/** Tasks deleted with "Geri al" still pending (hidden from every list until the delete is sent or undone). */
const hiddenTasks = new Set<string>();

export const taskKeys = {
  all: ['tasks'] as const,
  lists: ['tasks', 'list'] as const,
  list: (params: Record<string, string>) => ['tasks', 'list', params] as const,
  detail: (ref: string) => ['tasks', 'detail', ref.toUpperCase()] as const,
  summary: ['tasks', 'summary'] as const,
  people: ['tasks', 'people'] as const,
};

export const fetchTasks = async (params: Record<string, string>) => (await api.get<TaskListResponse>('/tasks', { params })).data;

export const useTaskList = (params: Record<string, string>, opts: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: taskKeys.list(params),
    queryFn: () => fetchTasks(params),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
    refetchInterval: 60_000,
    enabled: opts.enabled ?? true,
    select: (d) => (hiddenTasks.size ? { ...d, items: d.items.filter((i) => !hiddenTasks.has(i.id)) } : d),
  });

export const useTask = (ref: string | null) =>
  useQuery({
    queryKey: taskKeys.detail(ref ?? ''),
    queryFn: async () => (await api.get<{ task: TaskDetail }>(`/tasks/${encodeURIComponent(ref!)}`)).data.task,
    enabled: !!ref,
    retry: false,
    refetchInterval: 45_000,
  });

export const usePeople = () =>
  useQuery({
    queryKey: taskKeys.people,
    queryFn: async () => (await api.get<{ people: Person[] }>('/tasks/people')).data.people,
    staleTime: 5 * 60_000,
  });

export const searchCases = async (search: string) =>
  (await api.get<{ items: CaseRef[] }>('/tasks/case-options', { params: search ? { search } : {} })).data.items;

/** After any change: refresh lists and the rail badge; keep the open task in sync. */
export const afterChange = (qc: QueryClient, task?: TaskDetail) => {
  if (task) {
    qc.setQueryData(taskKeys.detail(task.key), task);
    qc.setQueryData(taskKeys.detail(task.id), task);
  }
  void qc.invalidateQueries({ queryKey: taskKeys.lists });
  void qc.invalidateQueries({ queryKey: taskKeys.summary });
};

export const useTaskActions = () => {
  const qc = useQueryClient();
  const done = (task: TaskDetail) => {
    afterChange(qc, task);
    return task;
  };
  const withChecklist = (ref: string, checklist: ChecklistItem[]) => {
    for (const key of [taskKeys.detail(ref)]) {
      qc.setQueryData<TaskDetail>(key, (old) => (old ? { ...old, checklist } : old));
    }
    void qc.invalidateQueries({ queryKey: taskKeys.lists });
    return checklist;
  };
  return {
    create: async (body: Record<string, unknown>) => done((await api.post<{ task: TaskDetail }>('/tasks', body)).data.task),
    update: async (ref: string, body: Record<string, unknown>) => done((await api.patch<{ task: TaskDetail }>(`/tasks/${ref}`, body)).data.task),
    remove: async (ref: string) => {
      await api.delete(`/tasks/${ref}`);
      qc.removeQueries({ queryKey: taskKeys.detail(ref) });
      afterChange(qc);
    },
    /** Delete with "Geri al" (10 s): hidden at once, the DELETE is sent when the undo window ends. */
    removeLater: (ref: string, id: string, message: string) => {
      hiddenTasks.add(id);
      void qc.cancelQueries({ queryKey: taskKeys.lists });
      qc.setQueriesData<TaskListResponse>({ queryKey: taskKeys.lists }, (old) => (old ? { ...old, items: old.items.filter((i) => i.id !== id), total: Math.max(0, old.total - 1) } : old));
      delayedCommit({
        message,
        commit: () => api.delete(`/tasks/${ref}`),
        keepalive: { method: 'DELETE', url: `/tasks/${ref}` },
        onCommitted: () => {
          hiddenTasks.delete(id);
          qc.removeQueries({ queryKey: taskKeys.detail(ref) });
          afterChange(qc);
        },
        rollback: () => {
          hiddenTasks.delete(id);
          afterChange(qc);
        },
      });
    },
    addAssignee: async (ref: string, userId: string) =>
      done((await api.post<{ task: TaskDetail }>(`/tasks/${ref}/assignees`, { userId })).data.task),
    comment: async (ref: string, body: string) => done((await api.post<{ task: TaskDetail }>(`/tasks/${ref}/comments`, { body })).data.task),
    editComment: async (ref: string, id: string, body: string) =>
      done((await api.patch<{ task: TaskDetail }>(`/tasks/${ref}/comments/${id}`, { body })).data.task),
    deleteComment: async (ref: string, id: string) => done((await api.delete<{ task: TaskDetail }>(`/tasks/${ref}/comments/${id}`)).data.task),
    attach: async (ref: string, nodeId: string) => done((await api.post<{ task: TaskDetail }>(`/tasks/${ref}/attachments`, { nodeId })).data.task),
    detach: async (ref: string, nodeId: string) => done((await api.delete<{ task: TaskDetail }>(`/tasks/${ref}/attachments/${nodeId}`)).data.task),
    /** Uploads one file from the computer into the task (stored in the company drive, linked to the task). */
    upload: async (ref: string, file: File, onProgress?: (pct: number) => void) => {
      const form = new FormData();
      form.append('file', await optimizeImage(file));
      const res = await api.post<{ task: TaskDetail }>(`/tasks/${ref}/files`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
      });
      return done(res.data.task);
    },
    checklistAdd: async (ref: string, text: string) =>
      withChecklist(ref, (await api.post<{ checklist: ChecklistItem[] }>(`/tasks/${ref}/checklist`, { text })).data.checklist),
    checklistUpdate: async (ref: string, id: string, body: { text?: string; done?: boolean }) => {
      const data = (await api.patch<{ checklist: ChecklistItem[]; completed?: boolean }>(`/tasks/${ref}/checklist/${id}`, body)).data;
      // An AI document-problems task completes itself when the last item is ticked: reload its status.
      if (data.completed) void qc.invalidateQueries({ queryKey: taskKeys.detail(ref) });
      return withChecklist(ref, data.checklist);
    },
    checklistDelete: async (ref: string, id: string) =>
      withChecklist(ref, (await api.delete<{ checklist: ChecklistItem[] }>(`/tasks/${ref}/checklist/${id}`)).data.checklist),
    checklistOrder: async (ref: string, ids: string[]) =>
      withChecklist(ref, (await api.put<{ checklist: ChecklistItem[] }>(`/tasks/${ref}/checklist/order`, { ids })).data.checklist),
  };
};

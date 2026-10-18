import { useQueryClient } from '@tanstack/react-query';
import { useRealtime } from '@/lib/realtime';
import { collabKeys } from './api';

/**
 * Keeps open drive views fresh when colleagues comment or lock files: comment panels and listings
 * (comment badges, "… is editing") refetch on `drive.comment` / `drive.lock`.
 */
export const useCollabRealtime = () => {
  const qc = useQueryClient();
  useRealtime('drive.comment', (p) => {
    const nodeId = typeof p.nodeId === 'string' ? p.nodeId : '';
    if (nodeId) void qc.invalidateQueries({ queryKey: collabKeys.comments(nodeId) });
    void qc.invalidateQueries({ queryKey: ['drive', 'children'] });
    void qc.invalidateQueries({ queryKey: ['drive', 'collab', 'activity'] });
  });
  useRealtime('drive.lock', (p) => {
    const nodeId = typeof p.nodeId === 'string' ? p.nodeId : '';
    if (nodeId) void qc.invalidateQueries({ queryKey: collabKeys.lock(nodeId) });
    void qc.invalidateQueries({ queryKey: ['drive', 'children'] });
  });
};

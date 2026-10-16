import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useRealtime } from '@/lib/realtime';

/**
 * Push mail in the workspace shell. The API keeps an IMAP IDLE connection per mailbox and sends
 * 'mail.new' (one per unread arrival in INBOX, also for woken snoozes) and 'mail.updated' (counts or
 * lists changed) over the shared realtime stream. Here:
 *  - the unread badge on the rail is refreshed at once (the mail page refreshes its own lists);
 *  - a small toast names sender and subject, unless the user is already looking at that inbox;
 *  - the tab title shows the unread count, "(3) Mail · Triad Vision".
 */

/** true when the mail page currently shows the list the message landed in. */
export const isViewingFolder = (pathname: string, accountId: string, folderId: string) => {
  const m = /^\/workspace\/mail(?:\/([^/]+))?(?:\/([^/]+))?/.exec(pathname);
  if (!m) return false;
  const account = m[1] ?? 'all';
  const seg = m[2] ?? 'v-inbox';
  if (seg.startsWith('f-')) return seg.slice(2) === folderId;
  return seg === 'v-inbox' && (account === 'all' || account === accountId);
};

const COUNT_PREFIX = /^\(\d+\+?\) /;

const setTitleCount = (n: number) => {
  const base = document.title.replace(COUNT_PREFIX, '');
  const next = n > 0 ? `(${n > 99 ? '99+' : n}) ${base}` : base;
  if (document.title !== next) document.title = next;
};

/** Keeps "(n) " in front of whatever title the current page sets (usePageTitle owns the rest). */
const useTitleCount = (count: number) => {
  const countRef = useRef(count);
  countRef.current = count;
  useEffect(() => {
    const el = document.querySelector('title');
    if (!el || typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => setTitleCount(countRef.current));
    obs.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      obs.disconnect();
      setTitleCount(0);
    };
  }, []);
  useEffect(() => setTitleCount(count), [count]);
};

export const useMailPush = (unread: number) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const refreshBadge = () => void qc.invalidateQueries({ queryKey: ['mail', 'summary'] });

  useRealtime('mail.new', (p) => {
    refreshBadge();
    const accountId = String(p.accountId ?? '');
    const folderId = String(p.folderId ?? '');
    const messageId = p.messageId ? String(p.messageId) : '';
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    if (visible && isViewingFolder(pathRef.current, accountId, folderId)) return;
    const from = String(p.from ?? '') || '?';
    const subject = String(p.subject ?? '') || t('workspace.mailToast.noSubject');
    toast(t('workspace.mailToast.newMail', { from }), {
      id: messageId ? `mail-${messageId}` : undefined,
      description: subject,
      action: messageId && accountId ? { label: t('workspace.mailToast.open'), onClick: () => navigate(`/workspace/mail/${accountId}/v-inbox/${messageId}`) } : undefined,
    });
  });
  useRealtime('mail.updated', refreshBadge);

  useTitleCount(unread);
};

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Copy,
  History,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAi } from '@/i18n/pagesAi';
import { Markdown } from './Markdown';
import { AiHttpError, streamPost, type AiAction, type AiContext, type AiConversationItem, type AiScope, type AiStoredMessage, type AiStreamEvent, type AiToolChip } from './api';
import { confirmDialog } from '@/components/ui/ConfirmHost';

registerCopy(pagesAi);

export interface ChatPanelProps {
  scope: AiScope;
  /** Where the panel was opened (drive folder, selected file, case …); sent with every message. */
  context?: AiContext;
  /** Narrow layout (side panel / slide-over): the chat list becomes an overlay. */
  compact?: boolean;
  className?: string;
  /** Optional close button in the header (slide-over). */
  onClose?: () => void;
}

interface UiMessage {
  key: string;
  id?: string;
  role: 'user' | 'assistant' | 'notice' | 'error';
  content: string;
  tools: AiToolChip[];
  actionIds: string[];
  streaming?: boolean;
  stopped?: boolean;
  costUsd?: number;
  /** For error bubbles: the text to send again. */
  retryContent?: string;
}

let seq = 0;
const nextKey = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

const fromStored = (messages: AiStoredMessage[], actions: AiAction[]): UiMessage[] => {
  const out: UiMessage[] = messages.map((m) => ({ key: m.id, id: m.id, role: m.role, content: m.content, tools: m.tools.map((c) => ({ ...c, status: 'done' as const })), actionIds: [], costUsd: m.costUsd }));
  // Attach every action to the last assistant message created before it.
  for (const a of actions) {
    const at = new Date(a.createdAt).getTime();
    let target = -1;
    messages.forEach((m, i) => {
      if (m.role === 'assistant' && new Date(m.createdAt).getTime() <= at) target = i;
    });
    if (target < 0) target = out.length - 1;
    if (target >= 0) out[target].actionIds.push(a.id);
  }
  return out;
};

const fmtUsd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);

export default function ChatPanel({ scope, context, compact = false, className, onClose }: ChatPanelProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [convId, setConvId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<UiMessage[]>([]);
  const [actions, setActions] = useState<Record<string, AiAction>>({});
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(!compact);
  const [copied, setCopied] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  // Context hint chips can pass their own context with an ai:prefill event; it applies to the next message.
  const prefillContext = useRef<AiContext | null>(null);
  const contextRef = useRef(context);
  contextRef.current = prefillContext.current ? { ...(context ?? {}), ...prefillContext.current } : context;

  // window 'ai:prefill' { text, context? }: put the text into the visible panel's input (never sends).
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const el = inputRef.current;
      if (!el || el.offsetParent === null) return; // hidden panel
      const detail = (e as CustomEvent<{ text?: string; context?: AiContext }>).detail ?? {};
      if (typeof detail.text !== 'string') return;
      prefillContext.current = detail.context ?? null;
      setInput(detail.text);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    };
    window.addEventListener('ai:prefill', onPrefill);
    return () => window.removeEventListener('ai:prefill', onPrefill);
  }, []);

  const listKey = useMemo(() => ['ai', 'conversations', scope] as const, [scope]);
  const { data: conversations } = useQuery({
    queryKey: listKey,
    queryFn: async () => (await api.get<{ items: AiConversationItem[] }>('/ai/conversations', { params: { scope } })).data.items,
    staleTime: 30_000,
  });

  // Abort a running stream when the panel unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Follow the answer while it streams, unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [msgs, actions]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const patchMsg = useCallback((key: string, fn: (m: UiMessage) => UiMessage) => {
    setMsgs((list) => list.map((m) => (m.key === key ? fn(m) : m)));
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      if (streaming) return;
      setLoadingConv(true);
      setConvId(id);
      if (compact) setHistoryOpen(false);
      try {
        const { data } = await api.get<{ messages: AiStoredMessage[]; actions: AiAction[] }>(`/ai/conversations/${id}`);
        setMsgs(fromStored(data.messages, data.actions));
        setActions(Object.fromEntries(data.actions.map((a) => [a.id, a])));
        stickToBottom.current = true;
      } catch {
        toast.error(t('ai.errors.generic'));
        setConvId(null);
        setMsgs([]);
      } finally {
        setLoadingConv(false);
      }
    },
    [compact, streaming, t],
  );

  const newChat = () => {
    if (streaming) abortRef.current?.abort();
    setConvId(null);
    setMsgs([]);
    setActions({});
    setInput('');
    if (compact) setHistoryOpen(false);
    inputRef.current?.focus();
  };

  const deleteConversation = async (id: string) => {
    const title = conversations?.find((c) => c.id === id)?.title || t('ai.untitled');
    if (!(await confirmDialog({ title: t('ui.confirmDlg.deleteTitle', { name: title }), message: t('ai.deleteConfirm'), confirmLabel: t('ui.confirmDlg.delete') }))) return;
    try {
      await api.delete(`/ai/conversations/${id}`);
      if (id === convId) newChat();
      void qc.invalidateQueries({ queryKey: listKey });
    } catch {
      toast.error(t('ai.errors.generic'));
    }
  };

  /** Runs one SSE request and folds its events into the assistant bubble `asstKey`. */
  const runStream = async (url: string, body: unknown, asstKey: string, opts: { retryContent?: string; onAction?: (a: AiAction) => void } = {}) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);
    stickToBottom.current = true;
    const handle = (e: AiStreamEvent) => {
      switch (e.event) {
        case 'delta':
          patchMsg(asstKey, (m) => ({ ...m, content: m.content + String(e.data.text ?? '') }));
          break;
        case 'tool': {
          const chip: AiToolChip = { callId: e.data.callId, name: e.data.name, label: e.data.label, status: e.data.status };
          patchMsg(asstKey, (m) => {
            const i = m.tools.findIndex((c) => c.callId === chip.callId);
            const tools = i < 0 ? [...m.tools, chip] : m.tools.map((c, j) => (j === i ? chip : c));
            return { ...m, tools };
          });
          break;
        }
        case 'action': {
          const a = e.data.action as AiAction;
          setActions((all) => ({ ...all, [a.id]: a }));
          setMsgs((list) => (list.some((m) => m.actionIds.includes(a.id)) ? list : list.map((m) => (m.key === asstKey ? { ...m, actionIds: [...m.actionIds, a.id] } : m))));
          opts.onAction?.(a);
          break;
        }
        case 'notice':
          setMsgs((list) => [...list, { key: nextKey(), role: 'notice', content: String(e.data.message ?? ''), tools: [], actionIds: [] }]);
          break;
        case 'done':
          patchMsg(asstKey, (m) => ({ ...m, id: e.data.messageId ?? m.id, costUsd: e.data.costUsd, streaming: false }));
          break;
        case 'error':
          patchMsg(asstKey, (m) => ({ ...m, role: m.content ? m.role : 'error', content: m.content || String(e.data.message ?? t('ai.errors.generic')), retryContent: opts.retryContent, streaming: false }));
          break;
        default:
          break;
      }
    };
    try {
      await streamPost(url, body, handle, ctrl.signal);
    } catch (err) {
      if (ctrl.signal.aborted) {
        patchMsg(asstKey, (m) => ({ ...m, stopped: true }));
      } else if (err instanceof AiHttpError) {
        const text =
          err.serverMessage ??
          (err.code === 'CONVERSATION_BUSY' ? t('ai.errors.busy') : err.status === 429 ? t('ai.errors.rateLimited') : err.status === 409 || err.status === 410 ? t('ai.errors.actionGone') : t('ai.errors.generic'));
        const isLimit = err.code === 'AI_LIMIT' || err.code === 'AI_DISABLED';
        patchMsg(asstKey, (m) => ({ ...m, role: isLimit ? 'notice' : 'error', content: text, retryContent: isLimit ? undefined : opts.retryContent }));
      } else {
        patchMsg(asstKey, (m) => ({ ...m, role: 'error', content: t('ai.errors.network'), retryContent: opts.retryContent }));
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      // Drop an assistant bubble that ended up empty (e.g. the follow-up was skipped).
      setMsgs((list) => list.map((m) => (m.key === asstKey ? { ...m, streaming: false } : m)).filter((m) => !(m.key === asstKey && m.role === 'assistant' && !m.content && !m.tools.length && !m.actionIds.length && !m.stopped)));
      void qc.invalidateQueries({ queryKey: listKey });
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;
    setInput('');
    let id = convId;
    const asstKey = nextKey();
    setMsgs((list) => [...list, { key: nextKey(), role: 'user', content: text, tools: [], actionIds: [] }, { key: asstKey, role: 'assistant', content: '', tools: [], actionIds: [], streaming: true }]);
    if (!id) {
      try {
        const ctx = contextRef.current;
        const { data } = await api.post<{ conversation: { id: string } }>('/ai/conversations', { scope, ...(ctx ? { context: ctx } : {}) });
        id = data.conversation.id;
        setConvId(id);
      } catch {
        patchMsg(asstKey, (m) => ({ ...m, role: 'error', content: t('ai.errors.generic'), retryContent: text, streaming: false }));
        return;
      }
    }
    const ctx = contextRef.current;
    prefillContext.current = null;
    await runStream(`/ai/conversations/${id}/messages`, { content: text, ...(ctx ? { context: ctx } : {}) }, asstKey, { retryContent: text });
  };

  const decide = async (action: AiAction, decision: 'confirm' | 'reject') => {
    if (streaming || deciding[action.id]) return;
    setDeciding((d) => ({ ...d, [action.id]: true }));
    const asstKey = nextKey();
    setMsgs((list) => [...list, { key: asstKey, role: 'assistant', content: '', tools: [], actionIds: [], streaming: true }]);
    let announced = false;
    try {
      await runStream(`/ai/actions/${action.id}/${decision}`, {}, asstKey, {
        onAction: (a) => {
          if (a.id !== action.id || a.status === 'PENDING' || announced) return;
          announced = true;
          // The drive / sheet editor refresh their data when an action was decided (DONE / FAILED / REJECTED).
          const pick = (v: unknown) => (v && typeof v === 'object' && typeof (v as { nodeId?: unknown }).nodeId === 'string' ? (v as { nodeId: string }).nodeId : undefined);
          const nodeId = pick(a.result) ?? pick(a.args);
          window.dispatchEvent(
            new CustomEvent('ai:action-done', { detail: { actionId: a.id, tool: a.tool, status: a.status, ok: a.status === 'DONE', ...(nodeId ? { nodeId } : {}) } }),
          );
        },
      });
      if (!announced && convId) {
        // 409/410: someone already decided or it expired — reload the real state.
        const { data } = await api.get<{ actions: AiAction[] }>(`/ai/conversations/${convId}`);
        setActions(Object.fromEntries(data.actions.map((a) => [a.id, a])));
      }
    } finally {
      setDeciding((d) => ({ ...d, [action.id]: false }));
    }
  };

  const copy = async (m: UiMessage) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(m.key);
      setTimeout(() => setCopied((c) => (c === m.key ? null : c)), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  // Grow the textarea with its content (up to ~6 lines).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const suggestions = (t(`ai.suggestions.${scope}`, { returnObjects: true }) as unknown as string[]) ?? [];
  const activeTitle = conversations?.find((c) => c.id === convId)?.title;
  const timeFmt = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'az', { hour: '2-digit', minute: '2-digit' }), [i18n.resolvedLanguage]);

  const history = (
    <aside
      className={clsx(
        'flex min-h-0 flex-col border-r border-line bg-surface',
        compact ? 'absolute inset-y-0 left-0 z-20 w-[min(18rem,85%)] shadow-[8px_0_30px_-12px_rgba(11,31,68,0.35)]' : 'w-60 shrink-0',
      )}
      aria-label={t('ai.history')}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <span className="text-xs font-bold tracking-wide text-muted uppercase">{t('ai.history')}</span>
        <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-card hover:text-ink" onClick={() => setHistoryOpen(false)} aria-label={t('ai.hideHistory')}>
          <ChevronLeft className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!conversations?.length && <p className="px-2 py-6 text-center text-xs text-muted">{t('ai.noConversations')}</p>}
        <ul className="space-y-0.5">
          {conversations?.map((c) => (
            <li key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => void openConversation(c.id)}
                className={clsx('flex w-full items-center gap-2 rounded-lg py-2 pr-9 pl-2.5 text-left text-sm transition-colors', c.id === convId ? 'bg-card font-semibold text-ink shadow-sm' : 'text-ink/80 hover:bg-card')}
              >
                <span className="min-w-0 flex-1 truncate">{c.title || t('ai.untitled')}</span>
                {c.pendingActions > 0 && <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={() => void deleteConversation(c.id)}
                className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-danger focus-visible:opacity-100"
                aria-label={`${t('ai.delete')}: ${c.title || t('ai.untitled')}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );

  const actionCard = (id: string) => {
    const a = actions[id];
    if (!a) return null;
    const busy = !!deciding[id];
    const expired = a.status === 'PENDING' && new Date(a.expiresAt).getTime() < Date.now();
    const status = expired ? 'EXPIRED' : a.status;
    const tone =
      status === 'DONE' ? 'text-emerald-700 bg-emerald-500/10' : status === 'FAILED' ? 'text-danger bg-red-500/10' : status === 'PENDING' ? 'text-amber-700 bg-amber-500/10' : 'text-muted bg-surface';
    const resultMessage = a.result && typeof a.result === 'object' && 'message' in (a.result as object) ? String((a.result as { message: unknown }).message) : null;
    return (
      <div key={id} className="mt-2 rounded-xl border border-line border-l-4 border-l-brand-500 bg-surface p-3" role="group" aria-label={t('ai.action.title')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
            <ShieldAlert className="size-3.5 text-brand-600" aria-hidden /> {t('ai.action.title')}
          </span>
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}>
            {status === 'DONE' ? <CheckCircle2 className="size-3" /> : status === 'FAILED' || status === 'REJECTED' ? <XCircle className="size-3" /> : <Clock className="size-3" />}
            {t(`ai.action.${status}`)}
          </span>
        </div>
        <p className="mt-2 text-sm font-medium break-words text-ink">{a.summary}</p>
        {status === 'PENDING' && (
          <>
            <p className="mt-1 text-[11px] text-muted">{t('ai.action.expires', { time: timeFmt.format(new Date(a.expiresAt)) })}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-primary btn-sm" disabled={busy || streaming} onClick={() => void decide(a, 'confirm')}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {busy ? t('ai.action.running') : t('ai.action.confirm')}
              </button>
              <button type="button" className="btn btn-sm border border-line bg-card text-ink hover:bg-surface" disabled={busy || streaming} onClick={() => void decide(a, 'reject')}>
                <X className="size-3.5" /> {t('ai.action.reject')}
              </button>
            </div>
          </>
        )}
        {status !== 'PENDING' && resultMessage && <p className="mt-1.5 text-xs break-words text-muted">{resultMessage}</p>}
        {scope === 'ADMIN' && (a.args !== undefined || (a.result !== null && a.result !== undefined)) && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted hover:text-ink">{t('ai.action.details')}</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-lg border border-line bg-card p-2 font-mono text-[11px] whitespace-pre-wrap text-ink">
              {JSON.stringify({ tool: a.tool, args: a.args, result: a.result }, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  };

  const empty = !msgs.length && !loadingConv;

  return (
    <div className={clsx('relative flex h-full min-h-0 overflow-hidden bg-card text-ink', className)}>
      {historyOpen && history}
      {historyOpen && compact && <button type="button" className="absolute inset-0 z-10 bg-navy-950/20" aria-label={t('ai.hideHistory')} onClick={() => setHistoryOpen(false)} />}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-1.5 border-b border-line px-2.5 py-2">
          {!historyOpen && (
            <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" onClick={() => setHistoryOpen(true)} aria-label={t('ai.showHistory')} title={t('ai.history')}>
              <History className="size-4" />
            </button>
          )}
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-600/10 text-brand-600" aria-hidden>
            <Sparkles className="size-4" />
          </span>
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{activeTitle || t('ai.assistant')}</h2>
          <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" onClick={newChat} aria-label={t('ai.newChat')} title={t('ai.newChat')}>
            <MessageSquarePlus className="size-4" />
          </button>
          {onClose && (
            <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" onClick={onClose} aria-label={t('ai.close')} title={t('ai.close')}>
              <X className="size-4" />
            </button>
          )}
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite" aria-busy={streaming}>
          {loadingConv && (
            <div className="grid h-full place-items-center text-brand-600">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          {empty && (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-600/10 text-brand-600">
                <Sparkles className="size-6" aria-hidden />
              </span>
              <p className="mt-3 text-base font-bold text-ink">{t('ai.emptyTitle')}</p>
              <p className="mt-1 text-sm text-muted">{scope === 'ADMIN' ? t('ai.emptyTextAdmin') : t('ai.emptyText')}</p>
              <p className="mt-5 text-xs font-semibold text-muted">{t('ai.suggestionsTitle')}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs font-medium text-ink transition-colors hover:border-brand-400 hover:text-brand-700">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ol className="space-y-4">
            {msgs.map((m) => {
              if (m.role === 'user')
                return (
                  <li key={m.key} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm whitespace-pre-wrap text-white shadow-sm break-words">
                      <span className="sr-only">{t('ai.you')}: </span>
                      {m.content}
                    </div>
                  </li>
                );
              if (m.role === 'notice')
                return (
                  <li key={m.key} className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-500/10 px-3 py-2.5 text-sm text-ink">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                    <span>{m.content}</span>
                  </li>
                );
              if (m.role === 'error')
                return (
                  <li key={m.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-red-300/60 bg-red-500/10 px-3 py-2.5 text-sm text-ink" role="alert">
                    <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0 flex-1">{m.content}</span>
                    {m.retryContent && !streaming && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-semibold hover:bg-surface"
                        onClick={() => {
                          const text = m.retryContent!;
                          setMsgs((list) => list.filter((x) => x.key !== m.key));
                          void send(text);
                        }}
                      >
                        <RotateCcw className="size-3" /> {t('ai.retry')}
                      </button>
                    )}
                  </li>
                );
              return (
                <li key={m.key} className="group flex gap-2.5">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-600/10 text-brand-600" aria-hidden>
                    <Sparkles className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {m.tools.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {m.tools.map((c) => (
                          <span key={c.callId} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted">
                            {c.status === 'running' ? <Loader2 className="size-3 animate-spin text-brand-600" /> : c.status === 'error' ? <XCircle className="size-3 text-danger" /> : <Check className="size-3 text-emerald-600" />}
                            {c.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.content ? (
                      <Markdown text={m.content} className="text-sm leading-relaxed break-words text-ink" />
                    ) : (
                      m.streaming &&
                      !m.tools.some((c) => c.status === 'running') && (
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                          <Loader2 className="size-3.5 animate-spin" /> {t('ai.thinking')}
                        </span>
                      )
                    )}
                    {m.stopped && <p className="mt-1 text-xs text-muted italic">{t('ai.stopped')}</p>}
                    {m.actionIds.map(actionCard)}
                    {!m.streaming && m.content && (
                      <div className="mt-1 flex items-center gap-2 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button type="button" onClick={() => void copy(m)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface hover:text-ink" aria-label={t('ai.copy')}>
                          {copied === m.key ? <Check className="size-3" /> : <Copy className="size-3" />} {copied === m.key ? t('ai.copied') : t('ai.copy')}
                        </button>
                        {scope === 'ADMIN' && typeof m.costUsd === 'number' && m.costUsd > 0 && <span className="text-[10px] text-muted tabular-nums">{fmtUsd(m.costUsd)}</span>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <form
          className="border-t border-line p-2.5 sm:p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-xl border border-line bg-field px-2.5 py-1.5 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={4000}
              placeholder={scope === 'ADMIN' ? t('ai.placeholderAdmin') : t('ai.placeholder')}
              aria-label={scope === 'ADMIN' ? t('ai.placeholderAdmin') : t('ai.placeholder')}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-muted/70"
            />
            {streaming ? (
              <button type="button" onClick={() => abortRef.current?.abort()} className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-navy-900 text-white hover:bg-navy-800" aria-label={t('ai.stop')} title={t('ai.stop')}>
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40" aria-label={t('ai.send')} title={t('ai.send')}>
                <SendHorizontal className="size-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 px-1 text-[11px] leading-snug text-muted">{scope === 'ADMIN' ? t('ai.disclaimerAdmin') : t('ai.disclaimer')}</p>
        </form>
      </section>
    </div>
  );
}

/** Named export as well (some callers import { ChatPanel } from this file directly). */
export { ChatPanel };

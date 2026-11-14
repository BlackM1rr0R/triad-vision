import type { Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { aiComplete, CHEAP_MODEL } from '../ai/complete.js';
import { scrubIdentifiers } from '../ai/redact.js';
import { publish } from '../messaging/realtime.js';
import { takeHit } from '../publicAi/guard.js';
import { publicBudget } from '../publicAi/budget.js';
import { bookPublicUsage } from '../publicAi/usage.js';
import { retrieve } from '../publicAi/knowledge.js';
import { MAX_TOKENS, advisorInput, advisorSystem, detectLang, splitLead } from '../publicAi/advisor.js';
import { addMessage, isOfflineChat, loadChat, visitorChannel } from './core.js';

/**
 * The AI advisor answering inside an offline live chat (nobody online / outside office hours) until a colleague
 * accepts it. Same grounding and rules as the site advisor (lib/publicAi/advisor.ts: site facts only, no
 * guarantees, no legal advice, no personal data), plus identifier scrubbing (passport / ID numbers, IBANs) of
 * everything the visitor wrote before it goes to the model. Answers are stored as author "AI" so the colleague
 * sees the whole conversation. Limits: AI_PER_CHAT_HOUR answers per chat, the public daily cap and the monthly
 * budget (lib/publicAi/budget.ts); over a limit the chat simply waits for staff.
 */

export const AI_PER_CHAT_HOUR = 10;

const OFFLINE_NOTE = `
Our colleagues are offline right now. They will read this conversation and answer personally as soon as they are back; say so briefly when the visitor wants a person.
Never ask for passport numbers, documents or other identifiers in the chat.`;

type Turn = { role: 'user' | 'assistant'; content: string };

/** Typing indicator for the visitor ("AI is typing…"). */
const typing = (chatId: string, on: boolean) => publish(visitorChannel(chatId), 'livechat.typing', { chatId, who: 'AI', on });

/** Answers the visitor's latest message when the chat is still an unaccepted offline chat. Never throws. */
export const answerOffline = async (chatId: string): Promise<boolean> => {
  try {
    const chat = await loadChat(chatId);
    if (!chat || chat.status !== 'WAITING' || !isOfflineChat(chat)) return false;
    const last = chat.messages.filter((m) => m.author !== 'SYSTEM').at(-1);
    if (!last || last.author !== 'VISITOR') return false;
    if (takeHit(`livechat-ai:${chat.id}`, { hour: AI_PER_CHAT_HOUR })) return false;
    if (await publicBudget()) return false;

    const before: Turn[] = Array.isArray(chat.transcript) ? (chat.transcript as Turn[]) : [];
    const live: Turn[] = chat.messages
      .filter((m) => m.author === 'VISITOR' || m.author === 'AI' || m.author === 'STAFF')
      .map((m) => ({ role: m.author === 'VISITOR' ? 'user' : 'assistant', content: m.body }));
    const history = [...before, ...live].map((m) => ({ ...m, content: scrubIdentifiers(m.content) }));
    const message = history.pop()!.content.slice(0, 600);
    const lang = detectLang(message, chat.locale as Locale);
    const recentUser = history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ');
    const { overview, excerpts } = await retrieve(lang, `${recentUser} ${message}`);

    typing(chat.id, true);
    const r = await aiComplete({
      userId: null,
      scope: 'CLIENT',
      purpose: 'public-livechat-offline',
      model: CHEAP_MODEL,
      system: advisorSystem(lang, overview, excerpts) + OFFLINE_NOTE,
      input: advisorInput(history, message),
      maxTokens: MAX_TOKENS,
      temperature: 0.3,
      timeoutMs: 25_000,
    });
    typing(chat.id, false);
    if (!r.ok) return false;
    void bookPublicUsage({ usd: r.costUsd, messages: 1 });
    const reply = splitLead(r.text).reply.slice(0, 2000);
    if (!reply) return false;
    // A colleague may have accepted the chat while the model was writing: then the AI stays quiet.
    const fresh = await prisma.liveChat.findUnique({ where: { id: chat.id }, select: { status: true } });
    if (fresh?.status !== 'WAITING') return false;
    await addMessage(chat, 'AI', reply);
    return true;
  } catch {
    typing(chatId, false);
    return false;
  }
};

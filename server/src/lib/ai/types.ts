import type { z } from 'zod';
import type { AiScope } from '@prisma/client';

/** Who is talking to the assistant (the logged-in user) and from where the chat was opened. */
export interface AiToolContext {
  user: { id: string; role: string; firstName: string; lastName: string; email: string; locale: string };
  scope: AiScope;
  conversationId: string;
  /** Where the chat panel was opened: the current drive folder, a selected file, a case page … */
  context?: { nodeId?: string; folderId?: string; caseId?: string; page?: string } | null;
}

/**
 * A capability the model may call. `run` gets validated arguments and returns JSON-serialisable data
 * (kept small: the result is sent back to the model).
 *
 * `confirm: true` marks a tool that changes something (move, rename, delete, edit cells …): the model's
 * call does NOT run immediately; the core stores an AiAction with `summary(args)` and the UI shows a
 * confirm card. Only after the user presses "Confirm" does `run` execute.
 */
export interface AiTool<A = unknown> {
  name: string; // snake_case, unique per scope
  description: string; // for the model: what it does and when to use it
  scope: AiScope; // CLIENT tools only ever see the caller's own data
  schema: z.ZodType<A>;
  /** JSON schema of the arguments for the model (OpenAI "function" parameters). */
  parameters: Record<string, unknown>;
  confirm?: boolean;
  /** Human sentence for the confirm card, in the user's locale. */
  summary?: (args: A, ctx: AiToolContext) => string | Promise<string>;
  run: (args: A, ctx: AiToolContext) => Promise<unknown>;
  /** Optional: short status line for the chat chip while the tool runs, per locale ("Sənədlərinizə baxıram…"). */
  label?: Partial<Record<'az' | 'de' | 'en' | 'ru', string>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAiTool = AiTool<any>;

import type { AiScope } from '@prisma/client';
import type { AnyAiTool } from './types.js';
import { extendAdminPrompt } from './prompts.js';
import type { OpenAiToolSpec } from './openrouter.js';

/**
 * Tool registry. Client tools register themselves from ./client/index.ts; the super-admin tools from
 * ./admin/index.ts (owned by the admin-tools stream) are loaded once with a guarded dynamic import.
 * Registering a tool with an existing (scope, name) replaces it, so double registration is harmless.
 */
const tools = new Map<string, AnyAiTool>();
const keyOf = (scope: AiScope, name: string) => `${scope}:${name}`;

export const registerAiTools = (list: AnyAiTool[]) => {
  for (const t of list) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(t.name)) throw new Error(`AI tool name must be snake_case: ${t.name}`);
    tools.set(keyOf(t.scope, t.name), t);
  }
};

/** Removes tools (tests register throw-away tools). */
export const unregisterAiTools = (names: string[], scope?: AiScope) => {
  for (const [k, t] of tools) if (names.includes(t.name) && (!scope || t.scope === scope)) tools.delete(k);
};

export const toolsFor = (scope: AiScope): AnyAiTool[] => [...tools.values()].filter((t) => t.scope === scope);

export const getTool = (scope: AiScope, name: string) => tools.get(keyOf(scope, name));

export const toolSpecs = (scope: AiScope): OpenAiToolSpec[] =>
  toolsFor(scope).map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.confirm ? `${t.description}\n(Changes something: the user must confirm it in the app before it runs.)` : t.description,
      parameters: t.parameters,
    },
  }));

let loading: Promise<void> | null = null;

/** Loads the client tools and (when the module exists) the admin tools; safe to call often. */
export const ensureToolsLoaded = () => {
  loading ??= (async () => {
    const client = await import('./client/index.js');
    registerAiTools(client.clientTools);
    try {
      const admin = (await import('./admin/index.js')) as { adminTools?: AnyAiTool[]; adminPrompt?: string };
      if (Array.isArray(admin.adminTools)) registerAiTools(admin.adminTools);
      if (typeof admin.adminPrompt === 'string' && admin.adminPrompt.trim()) extendAdminPrompt(admin.adminPrompt);
    } catch (err) {
      // The admin module is optional for the core; a broken one must not take the client assistant down.
      console.error('[ai] admin tools not loaded:', (err as Error).message);
    }
  })();
  return loading;
};

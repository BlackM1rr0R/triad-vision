/** Public surface of the AI assistant core (used by routes/ai.ts and the admin-tools module). */
export type { AiTool, AiToolContext, AnyAiTool } from './types.js';
export { registerAiTools, toolsFor, getTool, ensureToolsLoaded, unregisterAiTools } from './registry.js';
export { extendAdminPrompt } from './prompts.js';
export { untrusted, runTurn, decideAction, MAX_TOOL_ROUNDS, ACTION_TTL_MS } from './service.js';
export { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type AiTransport, type StreamChunk } from './openrouter.js';
export { getAiSettings, saveAiSettings, clearAiSettingsCache } from './settings.js';

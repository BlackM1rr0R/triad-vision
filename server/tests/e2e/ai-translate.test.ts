import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createVisaCategory } from '../helpers/factories';
import { clientCase, createCaseVia, expectStatus } from '../helpers/workflow';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache, saveAiSettings } from '../../src/lib/ai/settings.js';
import { parseModelJson, translateFields, translateMany, TRANSLATE_CONVERSATION_TITLE, TRANSLATE_MODEL } from '../../src/lib/ai/translate.js';

// Never the real key in tests (the fake transport ignores it anyway).
process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

// ─── Fake OpenRouter: "translates" by prefixing the language, e.g. "DE: <source>" ─────────────

const fake = { requests: [] as ChatRequest[], mode: 'ok' as 'ok' | 'fenced' | 'garbage' | 'hang' | 'error' };

const answer = (req: ChatRequest) => {
  const user = String(req.messages.find((m) => m.role === 'user')?.content ?? '');
  const json = JSON.parse(user.slice(user.indexOf('{'))) as Record<string, { source: string; into: string[] }>;
  return Object.fromEntries(Object.entries(json).map(([field, v]) => [field, Object.fromEntries(v.into.map((l) => [l, `${l.toUpperCase()}: ${v.source}`]))]));
};

beforeEach(() => {
  fake.requests = [];
  fake.mode = 'ok';
  clearAiSettingsCache();
  process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';
  setKeyInfoFetcher(async () => null);
  setModelsFetcher(async () => []);
  setAiTransport(async function* (req, { signal }): AsyncGenerator<StreamChunk> {
    fake.requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
    if (fake.mode === 'hang') {
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    if (fake.mode === 'error') throw new Error('upstream down');
    const text = fake.mode === 'garbage' ? 'Sorry, I cannot do that.' : JSON.stringify(answer(req));
    const out = fake.mode === 'fenced' ? `\`\`\`json\n${text}\n\`\`\`` : text;
    yield { choices: [{ delta: { content: out.slice(0, 5) } }] };
    yield { choices: [{ delta: { content: out.slice(5) }, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 60, cost: 0.000412 } };
  });
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
});

// ─── translateFields ───────────────────────────────────────────────────

describe('translateFields', () => {
  it('fills only the missing languages from the filled source and books the cost on the admin usage', async () => {
    const staff = await asStaff();
    const r = await translateFields({ de: 'Anerkennungsbescheid', en: 'Recognition notice' }, { userId: staff.user.id });
    expect(r).toMatchObject({ az: 'AZ: Anerkennungsbescheid', de: 'Anerkennungsbescheid', en: 'Recognition notice', ru: 'RU: Anerkennungsbescheid', autoTranslated: true, source: 'de' });
    expect(r.translated).toEqual(['az', 'ru']);

    // One cheap call with the strict-JSON prompt that keeps German official terms.
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({ model: TRANSLATE_MODEL, temperature: 0 });
    const system = String(fake.requests[0].messages[0].content);
    expect(system).toContain('strict JSON');
    expect(system).toContain('Anerkennung');
    expect(system).toContain('Vorabzustimmung');
    expect(system).toContain('Blaue Karte');

    // Cost recorded as a hidden row of an archived ADMIN conversation → counts for the monthly budget.
    const conv = await prisma.aiConversation.findFirstOrThrow({ where: { userId: staff.user.id, title: TRANSLATE_CONVERSATION_TITLE } });
    expect(conv).toMatchObject({ scope: 'ADMIN', archived: true });
    const msgs = await prisma.aiMessage.findMany({ where: { conversationId: conv.id } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: 'tool', toolName: 'translate', costMicros: 412, tokensIn: 300, tokensOut: 60 });
    // Not listed among the user's chats (archived), and a second translation reuses the conversation.
    await translateFields({ az: 'Pasport' }, { userId: staff.user.id });
    expect(await prisma.aiConversation.count({ where: { userId: staff.user.id } })).toBe(1);
    expect(await prisma.aiMessage.count({ where: { conversationId: conv.id } })).toBe(2);
  });

  it('does nothing when all languages are filled; translates several fields in one call; tolerates a code fence', async () => {
    const full = await translateFields({ az: 'a', de: 'b', en: 'c', ru: 'd' });
    expect(full).toMatchObject({ az: 'a', de: 'b', en: 'c', ru: 'd', autoTranslated: false, reason: 'NOTHING_TO_TRANSLATE' });
    expect(fake.requests).toHaveLength(0);

    fake.mode = 'fenced';
    const many = await translateMany({ title: { az: 'Diplom' }, description: { az: 'Notarial təsdiqli surət', de: 'Beglaubigte Kopie' } });
    expect(fake.requests).toHaveLength(1);
    expect(many.autoTranslated).toBe(true);
    expect(many.values.title).toEqual({ az: 'Diplom', de: 'DE: Diplom', en: 'EN: Diplom', ru: 'RU: Diplom' });
    expect(many.values.description).toEqual({ az: 'Notarial təsdiqli surət', de: 'Beglaubigte Kopie', en: 'EN: Notarial təsdiqli surət', ru: 'RU: Notarial təsdiqli surət' });
    expect(parseModelJson('noise {"a":{"de":"x"}} trailing')).toEqual({ a: { de: 'x' } });
    expect(parseModelJson('no json')).toBeNull();
  });

  it('respects the monthly budget: no call, the source text is copied, autoTranslated false', async () => {
    const admin = await asAdmin();
    await saveAiSettings({ monthlyBudgetUsd: 0 });
    const r = await translateFields({ az: 'Tibbi sığorta' }, { userId: admin.user.id });
    expect(r).toMatchObject({ az: 'Tibbi sığorta', de: 'Tibbi sığorta', en: 'Tibbi sığorta', ru: 'Tibbi sığorta', autoTranslated: false, reason: 'MONTHLY_BUDGET' });
    expect(fake.requests).toHaveLength(0);
    expect(await prisma.aiMessage.count()).toBe(0);
  });

  it('falls back without a key, on a timeout, an upstream error or an unusable answer — never throws', async () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(await translateFields({ az: 'Foto' })).toMatchObject({ de: 'Foto', autoTranslated: false, reason: 'NO_API_KEY' });
    process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

    fake.mode = 'hang';
    expect(await translateFields({ az: 'Foto' }, { timeoutMs: 50 })).toMatchObject({ ru: 'Foto', autoTranslated: false, reason: 'TIMEOUT' });
    fake.mode = 'error';
    expect(await translateFields({ az: 'Foto' })).toMatchObject({ en: 'Foto', autoTranslated: false, reason: 'UPSTREAM' });
    fake.mode = 'garbage';
    expect(await translateFields({ az: 'Foto' })).toMatchObject({ de: 'Foto', autoTranslated: false, reason: 'BAD_OUTPUT' });
    // copyOnFailure: false leaves the gaps (used by the "Translate" button).
    expect(await translateFields({ az: 'Foto' }, { copyOnFailure: false })).toMatchObject({ de: '', autoTranslated: false });
    expect(await translateFields({})).toMatchObject({ az: '', autoTranslated: false, reason: 'NO_SOURCE' });
  });
});

// ─── Requirement templates ─────────────────────────────────────────────

describe('requirement templates are stored in all four languages', () => {
  beforeEach(() => prisma.requirementTemplate.deleteMany());

  it('create translates the missing languages, marks them as AI and new cases get clean texts', async () => {
    const admin = await asAdmin();
    const res = expectStatus(
      await admin.agent.post('/api/admin/requirements').send({
        visaCategoryId: null,
        stage: 'INITIAL',
        key: 'ANERKENNUNG',
        title: { az: '', de: 'Anerkennungsbescheid', en: '', ru: '' },
        description: { az: '', de: 'Beglaubigte Kopie', en: '', ru: '' },
        required: true,
      }),
      201,
    ).body;
    expect(res.translation).toEqual({ autoTranslated: true, reason: null });
    expect(res.template.title).toEqual({ az: 'AZ: Anerkennungsbescheid', de: 'Anerkennungsbescheid', en: 'EN: Anerkennungsbescheid', ru: 'RU: Anerkennungsbescheid', _ai: ['az', 'en', 'ru'] });
    expect(res.template.description).toMatchObject({ az: 'AZ: Beglaubigte Kopie', en: 'EN: Beglaubigte Kopie', ru: 'RU: Beglaubigte Kopie', _ai: ['az', 'en', 'ru'] });
    expect(fake.requests).toHaveLength(1); // title + description in one call
    expect(await prisma.aiMessage.count({ where: { toolName: 'translate', conversation: { userId: admin.user.id, scope: 'ADMIN' } } })).toBe(1);

    // A person edits the English title: its AI mark goes, the others stay.
    const upd = expectStatus(
      await admin.agent.put(`/api/admin/requirements/${res.template.id}`).send({ title: { az: 'AZ: Anerkennungsbescheid', de: 'Anerkennungsbescheid', en: 'Recognition notice', ru: 'RU: Anerkennungsbescheid' } }),
      200,
    ).body;
    expect(upd.template.title._ai).toEqual(['az', 'ru']);
    expect(upd.translation).toBeNull(); // nothing missing → no AI call
    expect(fake.requests).toHaveLength(1);

    // The case copy carries the texts without the marker.
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const reqs = (await clientCase(client.agent, c.id)).requirements as unknown as { key: string | null; title: Record<string, unknown> }[];
    const row = reqs.find((r) => r.key === 'ANERKENNUNG')!;
    expect(row.title).toEqual({ az: 'AZ: Anerkennungsbescheid', de: 'Anerkennungsbescheid', en: 'Recognition notice', ru: 'RU: Anerkennungsbescheid' });
  });

  it('without the AI (budget used up) the source text is copied and the response says so', async () => {
    const admin = await asAdmin();
    await saveAiSettings({ monthlyBudgetUsd: 0 });
    const visa = await createVisaCategory();
    const res = expectStatus(
      await admin.agent.post('/api/admin/requirements').send({ visaCategoryId: visa.id, stage: 'EMBASSY', key: null, title: { az: 'Yaşayış yeri sübutu', de: '', en: '', ru: '' }, required: false }),
      201,
    ).body;
    expect(res.template.title).toEqual({ az: 'Yaşayış yeri sübutu', de: 'Yaşayış yeri sübutu', en: 'Yaşayış yeri sübutu', ru: 'Yaşayış yeri sübutu' });
    expect(res.translation).toEqual({ autoTranslated: false, reason: 'MONTHLY_BUDGET' });
    expect(fake.requests).toHaveLength(0);
  });

  it('the editor may send the languages it filled with the Translate button (kept as AI marks)', async () => {
    const admin = await asAdmin();
    const res = expectStatus(
      await admin.agent.post('/api/admin/requirements').send({ visaCategoryId: null, stage: 'INITIAL', title: { az: 'Foto', de: 'DE: Foto', en: 'EN: Foto', ru: 'RU: Foto' }, ai: { title: ['de', 'en', 'ru'] } }),
      201,
    ).body;
    expect(res.template.title._ai).toEqual(['de', 'en', 'ru']);
    expect(fake.requests).toHaveLength(0);
  });
});

// ─── On-demand endpoint ────────────────────────────────────────────────

describe('POST /api/admin/translate', () => {
  it('re-translates the requested languages for staff and never copies on failure', async () => {
    const staff = await asStaff();
    const res = expectStatus(
      await staff.agent.post('/api/admin/translate').send({
        fields: { title: { az: 'Sürücülük vəsiqəsi', de: 'Sürücülük vəsiqəsi', en: '', ru: 'old' } },
        source: 'az',
        overwrite: { title: ['de', 'ru'] },
      }),
      200,
    ).body;
    expect(res).toMatchObject({ autoTranslated: true, reason: null });
    expect(res.values.title).toEqual({ az: 'Sürücülük vəsiqəsi', de: 'DE: Sürücülük vəsiqəsi', en: 'EN: Sürücülük vəsiqəsi', ru: 'RU: Sürücülük vəsiqəsi' });
    expect(res.translated.title.sort()).toEqual(['de', 'en', 'ru']);

    fake.mode = 'error';
    const failed = expectStatus(await staff.agent.post('/api/admin/translate').send({ fields: { t: { az: 'Foto' } } }), 200).body;
    expect(failed).toMatchObject({ autoTranslated: false, reason: 'UPSTREAM' });
    expect(failed.values.t.de).toBe('');

    const client = await asClient();
    expect((await client.agent.post('/api/admin/translate').send({ fields: { t: { az: 'x' } } })).status).toBe(403);
    expect((await staff.agent.post('/api/admin/translate').send({ fields: {} })).status).toBe(400);
  });
});

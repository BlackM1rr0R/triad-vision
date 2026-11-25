import { afterAll, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { removeVoice, VOICE_STEP_KEYS } from '../../src/lib/journey/voiceGuide.js';

// Voice guide: ADMIN+ upload one audio file per journey step (mp3 / m4a / webm, 5 MB); signed-in users stream it;
// a step without audio is simply absent from the list (no button in the cabinet).

const mp3 = () => Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2048, 7)]);

afterAll(async () => {
  for (const k of VOICE_STEP_KEYS) await removeVoice(k);
});

describe('journey voice guide', () => {
  it('admin uploads, clients list and stream the audio, staff cannot write, anonymous sees nothing', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const staff = await asStaff();

    expect((await client.agent.get('/api/journey/voice')).body.steps).toEqual([]);

    const put = await admin.agent.put('/api/admin/journey/voice/contract').attach('file', mp3(), { filename: 'contract.mp3', contentType: 'audio/mpeg' });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.ext).toBe('mp3');

    const list = await client.agent.get('/api/journey/voice');
    expect(list.status).toBe(200);
    expect(list.body.steps.map((s: { key: string }) => s.key)).toEqual(['contract']);
    const audio = await client.agent.get('/api/journey/voice/contract/audio');
    expect(audio.status).toBe(200);
    expect(audio.headers['content-type']).toContain('audio/mpeg');
    expect((await client.agent.get('/api/journey/voice/travel/audio')).status).toBe(404);
    expect((await client.agent.get('/api/journey/voice/..%2Fsecret/audio')).status).toBe(404);

    // the admin list shows every step; staff may read it but not change it; clients have no admin access
    const adminList = await admin.agent.get('/api/admin/journey/voice');
    expect(adminList.body.items).toHaveLength(VOICE_STEP_KEYS.length);
    expect(adminList.body.items.find((i: { key: string }) => i.key === 'contract')).toMatchObject({ exists: true });
    expect((await staff.agent.get('/api/admin/journey/voice')).status).toBe(200);
    expect((await staff.agent.put('/api/admin/journey/voice/travel').attach('file', mp3(), 'a.mp3')).status).toBe(403);
    expect((await staff.agent.delete('/api/admin/journey/voice/contract')).status).toBe(403);
    expect((await client.agent.get('/api/admin/journey/voice')).status).toBe(403);
    expect((await client.agent.put('/api/admin/journey/voice/travel').attach('file', mp3(), 'a.mp3')).status).toBe(403);
    expect((await anon().get('/api/journey/voice')).status).toBe(401);
    expect((await anon().get('/api/journey/voice/contract/audio')).status).toBe(401);

    expect((await admin.agent.delete('/api/admin/journey/voice/contract')).status).toBe(200);
    expect((await client.agent.get('/api/journey/voice')).body.steps).toEqual([]);
  });

  it('rejects wrong types, oversize files and unknown steps', async () => {
    const admin = await asAdmin();
    const html = await admin.agent.put('/api/admin/journey/voice/embassy').attach('file', Buffer.from('<html><body>not audio at all, sorry</body></html>'), { filename: 'x.mp3', contentType: 'audio/mpeg' });
    expect(html.status).toBe(400);
    expect(html.body.error).toBe('UNSUPPORTED_FILE_TYPE');
    const big = await admin.agent.put('/api/admin/journey/voice/embassy').attach('file', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(5 * 1024 * 1024 + 10)]), 'big.mp3');
    expect([400, 413]).toContain(big.status);
    expect((await admin.agent.put('/api/admin/journey/voice/nope').attach('file', mp3(), 'a.mp3')).status).toBe(404);
    expect((await admin.agent.put('/api/admin/journey/voice/embassy')).status).toBe(400);
  });
});

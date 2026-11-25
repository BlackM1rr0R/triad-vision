import { describe, expect, it } from 'vitest';
import { VOICE_MAX_BYTES, VOICE_STEP_KEYS, isVoiceStep, sniffVoice } from '../../src/lib/journey/voiceGuide.js';

const pad = (head: number[]) => {
  const b = Buffer.alloc(32);
  Buffer.from(head).copy(b, 0);
  return b;
};

describe('voice guide files', () => {
  it('recognises mp3 / m4a / webm by their first bytes and rejects anything else', () => {
    expect(sniffVoice(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(30)]))).toBe('mp3');
    expect(sniffVoice(pad([0xff, 0xfb, 0x90]))).toBe('mp3');
    expect(sniffVoice(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(20)]))).toBe('m4a');
    expect(sniffVoice(pad([0x1a, 0x45, 0xdf, 0xa3]))).toBe('webm');
    expect(sniffVoice(Buffer.from('%PDF-1.7 not audio at all'))).toBeNull();
    expect(sniffVoice(Buffer.from('<?php echo 1; ?> padding padding'))).toBeNull();
    expect(sniffVoice(Buffer.alloc(4))).toBeNull();
  });

  it('step keys follow the cabinet journey and the limit is 5 MB', () => {
    expect([...VOICE_STEP_KEYS]).toEqual(['documents', 'recognition', 'contract', 'embassy', 'decision', 'travel', 'arrival']);
    expect(isVoiceStep('contract')).toBe(true);
    expect(isVoiceStep('../../etc/passwd')).toBe(false);
    expect(VOICE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});

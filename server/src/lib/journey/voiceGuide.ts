import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../../config.js';
import { badRequest } from '../http.js';

/**
 * Voice guide: one short audio narration per client journey step (the same keys as the cabinet's journey map,
 * client/src/components/portal/journey.ts MILESTONE_KEYS), recorded by the owner. Files live in
 * <uploads>/private/voice-guide/<step>.<ext>; no table: the file is the record. Uploading replaces the old one.
 * Limits: 5 MB; mp3 / m4a / webm only, checked by their first bytes (not by the client's claimed type).
 */
export const VOICE_STEP_KEYS = ['documents', 'recognition', 'contract', 'embassy', 'decision', 'travel', 'arrival'] as const;
export type VoiceStepKey = (typeof VOICE_STEP_KEYS)[number];
export const isVoiceStep = (v: string): v is VoiceStepKey => (VOICE_STEP_KEYS as readonly string[]).includes(v);

export const VOICE_MAX_BYTES = 5 * 1024 * 1024;
export const VOICE_DIR = path.join(config.uploads.privateDir, 'voice-guide');
fs.mkdirSync(VOICE_DIR, { recursive: true });

export const VOICE_TYPES = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
} as const;
export type VoiceExt = keyof typeof VOICE_TYPES;

/** Container sniffing: ID3 tag / MPEG frame sync (mp3), "ftyp" box (m4a / mp4 audio), EBML header (webm). */
export const sniffVoice = (b: Buffer): VoiceExt | null => {
  if (b.length < 12) return null;
  if (b.subarray(0, 3).toString('latin1') === 'ID3') return 'mp3';
  if (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) return 'mp3';
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return 'm4a';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  return null;
};

export const voiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: VOICE_MAX_BYTES, files: 1 } });

const filesOf = async () => {
  const names = await fsp.readdir(VOICE_DIR).catch(() => [] as string[]);
  return names;
};

/** The stored file of a step (or null). */
export const voiceFile = async (key: VoiceStepKey) => {
  for (const name of await filesOf()) {
    const ext = path.extname(name).slice(1) as VoiceExt;
    if (path.basename(name, `.${ext}`) === key && ext in VOICE_TYPES) {
      const file = path.join(VOICE_DIR, name);
      const st = await fsp.stat(file).catch(() => null);
      if (st) return { file, mime: VOICE_TYPES[ext], size: st.size, updatedAt: st.mtime };
    }
  }
  return null;
};

export const listVoice = async () => {
  const out: { key: VoiceStepKey; exists: boolean; size: number | null; updatedAt: Date | null }[] = [];
  for (const key of VOICE_STEP_KEYS) {
    const f = await voiceFile(key);
    out.push({ key, exists: !!f, size: f?.size ?? null, updatedAt: f?.updatedAt ?? null });
  }
  return out;
};

export const removeVoice = async (key: VoiceStepKey) => {
  for (const ext of Object.keys(VOICE_TYPES)) await fsp.rm(path.join(VOICE_DIR, `${key}.${ext}`), { force: true });
};

export const saveVoice = async (key: VoiceStepKey, buf: Buffer) => {
  if (buf.length > VOICE_MAX_BYTES) throw badRequest('FILE_TOO_LARGE');
  const ext = sniffVoice(buf);
  if (!ext) throw badRequest('UNSUPPORTED_FILE_TYPE');
  await removeVoice(key);
  await fsp.writeFile(path.join(VOICE_DIR, `${key}.${ext}`), buf);
  return ext;
};

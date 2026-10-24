import { detectDocument, processPage, type EnhanceMode, type Quad } from './geometry';

/** Messages between the scanner UI and its Web Worker (also run on the main thread when workers fail). */
export type ScanRequest =
  | { type: 'detect'; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'process'; data: Uint8ClampedArray; width: number; height: number; quad: Quad; mode: EnhanceMode; turns: number; maxLong?: number };

export type ScanResult =
  | { type: 'detect'; quad: Quad; found: boolean }
  | { type: 'process'; data: Uint8ClampedArray; width: number; height: number };

export const runJob = (req: ScanRequest): ScanResult => {
  if (req.type === 'detect') {
    const d = detectDocument(req.data, req.width, req.height, req.width);
    return { type: 'detect', quad: d.quad, found: d.found };
  }
  const out = processPage(req.data, req.width, req.height, { quad: req.quad, mode: req.mode, turns: req.turns, maxLong: req.maxLong });
  return { type: 'process', ...out };
};

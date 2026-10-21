declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: 'JPEG' | 'PNG';
    /** 0…1 (JPEG only). */
    quality?: number;
  }
  const convert: (opts: HeicConvertOptions) => Promise<ArrayBuffer | Uint8Array>;
  export default convert;
}

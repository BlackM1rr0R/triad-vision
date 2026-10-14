import fs from 'node:fs';
import { crc32 } from 'node:zlib';
import type { Writable } from 'node:stream';

/**
 * Minimal streaming ZIP writer (method "stored", no compression) with no dependencies. Enough to
 * export a workspace folder as one archive; PDFs and Office files are already compressed anyway.
 * Uses data descriptors so a file can be streamed without knowing its CRC up front.
 */

interface Entry {
  name: string;
  size: number;
  crc: number;
  offset: number;
  mtime: Date;
}

const dosTime = (d: Date) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d: Date) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

const write = (out: Writable, buf: Buffer) =>
  new Promise<void>((resolve, reject) => {
    out.write(buf, (err) => (err ? reject(err) : resolve()));
  });

export class ZipWriter {
  private entries: Entry[] = [];
  private offset = 0;

  constructor(private out: Writable) {}

  /** Streams a file from disk into the archive under `name` (forward-slash path inside the zip). */
  async addFile(name: string, filePath: string, mtime = new Date()) {
    const nameBuf = Buffer.from(name, 'utf8');
    const offset = this.offset;
    // Local file header; bit 3 = sizes/CRC follow the data, bit 11 = UTF-8 names.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0808, 6); // flags
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(dosTime(mtime), 10);
    local.writeUInt16LE(dosDate(mtime), 12);
    // crc, sizes = 0 here (in descriptor)
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    await write(this.out, Buffer.concat([local, nameBuf]));
    this.offset += 30 + nameBuf.length;

    let crc = 0;
    let size = 0;
    for await (const chunk of fs.createReadStream(filePath)) {
      const buf = chunk as Buffer;
      crc = crc32(buf, crc);
      size += buf.length;
      await write(this.out, buf);
    }
    this.offset += size;

    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc >>> 0, 4);
    desc.writeUInt32LE(size, 8);
    desc.writeUInt32LE(size, 12);
    await write(this.out, desc);
    this.offset += 16;

    this.entries.push({ name, size, crc: crc >>> 0, offset, mtime });
  }

  /** Writes the central directory and ends the stream. */
  async finish() {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const nameBuf = Buffer.from(e.name, 'utf8');
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4); // made by
      h.writeUInt16LE(20, 6); // needed
      h.writeUInt16LE(0x0808, 8);
      h.writeUInt16LE(0, 10);
      h.writeUInt16LE(dosTime(e.mtime), 12);
      h.writeUInt16LE(dosDate(e.mtime), 14);
      h.writeUInt32LE(e.crc, 16);
      h.writeUInt32LE(e.size, 20);
      h.writeUInt32LE(e.size, 24);
      h.writeUInt16LE(nameBuf.length, 28);
      h.writeUInt16LE(0, 30); // extra
      h.writeUInt16LE(0, 32); // comment
      h.writeUInt16LE(0, 34); // disk
      h.writeUInt16LE(0, 36); // internal attrs
      h.writeUInt32LE(0, 38); // external attrs
      h.writeUInt32LE(e.offset, 42);
      await write(this.out, Buffer.concat([h, nameBuf]));
      this.offset += 46 + nameBuf.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.offset - cdStart, 12);
    end.writeUInt32LE(cdStart, 16);
    end.writeUInt16LE(0, 20);
    await write(this.out, end);
    await new Promise<void>((resolve) => this.out.end(resolve));
  }
}

"use client";

/**
 * Minimal ZIP file writer — STORE method only (no compression).
 *
 * Produces a valid PKZIP file readable by every system ZIP tool.
 * No external dependencies. ~3 KB minified.
 *
 * Compression isn't needed because storyboard payloads are already JPEG/WEBP
 * which are pre-compressed; STORE keeps the export fast and bundle small.
 *
 * Format reference: PKZIP APPNOTE.txt sections 4.3 + 4.4.
 *   - Local file header (per entry)
 *   - File data (raw, uncompressed)
 *   - Central directory header (per entry)
 *   - End of central directory record
 */

interface Entry {
  path:  string;
  bytes: Uint8Array;
}

// CRC-32 lookup table (IEEE 802.3) — generated once, used for every file
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function encodePath(p: string): Uint8Array {
  return new TextEncoder().encode(p);
}

function writeUint16(view: DataView, offset: number, v: number) { view.setUint16(offset, v, true); }
function writeUint32(view: DataView, offset: number, v: number) { view.setUint32(offset, v, true); }

export function buildZip(entries: Entry[]): Uint8Array {
  // First pass — build local file headers + data, track sizes for central dir
  type Recorded = { entry: Entry; nameBytes: Uint8Array; crc: number; localHeaderOffset: number; localBlock: Uint8Array };
  const recorded: Recorded[] = [];
  let cursor = 0;

  // Pre-compute total size to allocate one big buffer
  let totalLocal = 0;
  let totalCentral = 0;

  for (const entry of entries) {
    const nameBytes = encodePath(entry.path);
    const crc       = crc32(entry.bytes);
    const headerLen = 30 + nameBytes.length;
    const dataLen   = entry.bytes.length;
    const localBlock = new Uint8Array(headerLen + dataLen);
    const view = new DataView(localBlock.buffer);
    // Local file header signature  4
    writeUint32(view, 0, 0x04034b50);
    // Version needed to extract    2
    writeUint16(view, 4, 20);
    // General purpose flag         2
    writeUint16(view, 6, 0);
    // Compression method (0=store) 2
    writeUint16(view, 8, 0);
    // File last mod time/date      4 (we use 0 — many ZIP tools accept this)
    writeUint16(view, 10, 0);
    writeUint16(view, 12, 0);
    // CRC-32                       4
    writeUint32(view, 14, crc);
    // Compressed size              4
    writeUint32(view, 18, dataLen);
    // Uncompressed size            4
    writeUint32(view, 22, dataLen);
    // File name length             2
    writeUint16(view, 26, nameBytes.length);
    // Extra field length           2
    writeUint16(view, 28, 0);
    // Name
    localBlock.set(nameBytes, 30);
    // Data
    localBlock.set(entry.bytes, 30 + nameBytes.length);

    recorded.push({ entry, nameBytes, crc, localHeaderOffset: cursor, localBlock });
    cursor += localBlock.length;
    totalLocal += localBlock.length;
    totalCentral += 46 + nameBytes.length;
  }

  // Allocate final buffer
  const eocdLen = 22;
  const finalBuf = new Uint8Array(totalLocal + totalCentral + eocdLen);
  let writePos = 0;

  // Write all local blocks
  for (const r of recorded) {
    finalBuf.set(r.localBlock, writePos);
    writePos += r.localBlock.length;
  }

  // Central directory
  const centralStart = writePos;
  for (const r of recorded) {
    const centralLen = 46 + r.nameBytes.length;
    const block = new Uint8Array(centralLen);
    const view = new DataView(block.buffer);
    writeUint32(view, 0, 0x02014b50);   // central dir signature
    writeUint16(view, 4, 20);            // version made by
    writeUint16(view, 6, 20);            // version needed
    writeUint16(view, 8, 0);             // flags
    writeUint16(view, 10, 0);            // compression
    writeUint16(view, 12, 0);            // mod time
    writeUint16(view, 14, 0);            // mod date
    writeUint32(view, 16, r.crc);
    writeUint32(view, 20, r.entry.bytes.length); // compressed size
    writeUint32(view, 24, r.entry.bytes.length); // uncompressed
    writeUint16(view, 28, r.nameBytes.length);
    writeUint16(view, 30, 0);            // extra
    writeUint16(view, 32, 0);            // comment len
    writeUint16(view, 34, 0);            // disk number
    writeUint16(view, 36, 0);            // internal attrs
    writeUint32(view, 38, 0);            // external attrs
    writeUint32(view, 42, r.localHeaderOffset);
    block.set(r.nameBytes, 46);
    finalBuf.set(block, writePos);
    writePos += centralLen;
  }
  const centralLen = writePos - centralStart;

  // End-of-central-directory record
  const eocd = new Uint8Array(eocdLen);
  const eocdView = new DataView(eocd.buffer);
  writeUint32(eocdView, 0, 0x06054b50);
  writeUint16(eocdView, 4, 0);                 // disk number
  writeUint16(eocdView, 6, 0);                 // disk with central dir
  writeUint16(eocdView, 8, recorded.length);
  writeUint16(eocdView, 10, recorded.length);
  writeUint32(eocdView, 12, centralLen);
  writeUint32(eocdView, 16, centralStart);
  writeUint16(eocdView, 20, 0);                // comment length
  finalBuf.set(eocd, writePos);

  return finalBuf;
}

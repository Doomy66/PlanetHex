/**
 * A zip file assembled in the browser, for the save of 6.4.1 on a browser with
 * no File System Access API. See files.ts.
 *
 * Stored, not deflated. The four map images of 6.4.5 are PNGs, which are
 * already compressed, and the planet's JSON is a few kilobytes beside them.
 * Deflating either again would cost a dependency and save nothing worth having.
 *
 * Nothing here touches the document, so the archive a browser download hands
 * over is the same one the tests read back.
 */

/**
 * Bytes backed by a plain ArrayBuffer rather than a shared one. Spelled out
 * because a Blob will not take a view that might be over shared memory, and the
 * whole point of the entries is that they end up in one.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export interface ZipEntry {
  readonly name: string;
  readonly data: Bytes;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;

/** Store, and the version of the format that first had it. */
const STORED = 0;
const VERSION = 20;

/** A run of bytes written little endian, which is the order zip counts in. */
class Writer {
  private readonly view: DataView;
  private readonly bytes: Bytes;
  private at = 0;

  constructor(length: number) {
    this.bytes = new Uint8Array(new ArrayBuffer(length));
    this.view = new DataView(this.bytes.buffer);
  }

  u16(value: number): this {
    this.view.setUint16(this.at, value, true);
    this.at += 2;
    return this;
  }

  u32(value: number): this {
    this.view.setUint32(this.at, value >>> 0, true);
    this.at += 4;
    return this;
  }

  raw(value: Bytes): this {
    this.bytes.set(value, this.at);
    this.at += value.length;
    return this;
  }

  done(): Bytes {
    return this.bytes;
  }
}

/**
 * The entries as one archive. The timestamp is a parameter so a test can pin
 * it; a save takes the moment it was made, which is what a file's date is for.
 */
export function buildZip(entries: readonly ZipEntry[], at: Date = new Date()): Blob {
  const stamp = dosStamp(at);
  const encoder = new TextEncoder();
  const parts: Bytes[] = [];
  const directory: Bytes[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Writer(30 + name.length)
      .u32(LOCAL_HEADER)
      .u16(VERSION)
      .u16(0) // No flags. The names are sanitised to ASCII by files.ts.
      .u16(STORED)
      .u16(stamp.time)
      .u16(stamp.date)
      .u32(crc)
      .u32(size) // Stored, so the compressed size is the size.
      .u32(size)
      .u16(name.length)
      .u16(0) // No extra field.
      .raw(name)
      .done();

    parts.push(local, entry.data);

    directory.push(
      new Writer(46 + name.length)
        .u32(CENTRAL_HEADER)
        .u16(VERSION)
        .u16(VERSION)
        .u16(0)
        .u16(STORED)
        .u16(stamp.time)
        .u16(stamp.date)
        .u32(crc)
        .u32(size)
        .u32(size)
        .u16(name.length)
        .u16(0) // No extra field.
        .u16(0) // No comment.
        .u16(0) // One disk, and this is it.
        .u16(0) // Internal attributes.
        .u32(0) // External attributes.
        .u32(offset)
        .raw(name)
        .done(),
    );

    offset += local.length + size;
  }

  const directorySize = directory.reduce((total, record) => total + record.length, 0);
  const end = new Writer(22)
    .u32(END_OF_DIRECTORY)
    .u16(0)
    .u16(0)
    .u16(entries.length)
    .u16(entries.length)
    .u32(directorySize)
    .u32(offset)
    .u16(0) // No comment.
    .done();

  return new Blob([...parts, ...directory, end], { type: "application/zip" });
}

/**
 * The date and time as MS-DOS packs them, which is what a zip entry carries.
 * Seconds go in two at a time, and the year is counted from 1980.
 */
function dosStamp(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getFullYear());
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Bytes): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * The entries back out of an archive this module wrote. A load offers the zip a
 * save handed over, since asking the user to unpack it first would make the two
 * halves of 6.4.1 disagree about what a save is.
 *
 * The local headers are walked in order rather than the central directory being
 * read, which is enough for an archive whose entries are all stored and none of
 * which is streamed. Anything else is refused rather than guessed at.
 */
export function readZip(bytes: Bytes): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = 0;

  while (at + 30 <= bytes.length && view.getUint32(at, true) === LOCAL_HEADER) {
    const flags = view.getUint16(at + 6, true);
    const method = view.getUint16(at + 8, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    // Bit 3 puts the sizes after the data instead of here, so the header cannot
    // be trusted to say where the next one starts.
    if (method !== STORED || (flags & 0x08) !== 0) {
      throw new Error("This zip was not written by PlanetHex and cannot be read.");
    }
    const start = at + 30 + nameLength + extraLength;
    entries.push({
      name: decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength)),
      data: bytes.subarray(start, start + size),
    });
    at = start + size;
  }

  if (entries.length === 0) throw new Error("This file is not a zip PlanetHex can read.");
  return entries;
}

import { describe, expect, it } from "vitest";
import { buildZip, crc32, readZip } from "./zip";

/**
 * The archive of 6.4.1 on a browser with no File System Access API. What
 * matters is that it is a real zip: the signatures and counts a stock unpacker
 * looks for, and the bytes coming back out as they went in.
 */

const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const text = (value: string) => new TextEncoder().encode(value);

const AT = new Date(2026, 8, 6, 14, 30, 20);

describe("crc32", () => {
  // The check value the format's own specification gives for this string.
  it("gives the known check value", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
  });

  it("gives zero for nothing", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("building an archive", () => {
  it("starts with a local file header and ends with the directory", async () => {
    const raw = await bytes(buildZip([{ name: "Regina.json", data: text("{}") }], AT));
    const view = new DataView(raw.buffer);

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(raw.length - 22, true)).toBe(0x06054b50);
    // One entry, counted on this disk and overall.
    expect(view.getUint16(raw.length - 14, true)).toBe(1);
    expect(view.getUint16(raw.length - 12, true)).toBe(1);
  });

  it("points the directory at where the entries actually are", async () => {
    const entries = [
      { name: "Regina.json", data: text('{"name":"Regina"}') },
      { name: "Regina-6.png", data: new Uint8Array([137, 80, 78, 71]) },
    ];
    const raw = await bytes(buildZip(entries, AT));
    const view = new DataView(raw.buffer);

    const directorySize = view.getUint32(raw.length - 10, true);
    const directoryAt = view.getUint32(raw.length - 6, true);
    expect(directoryAt + directorySize).toBe(raw.length - 22);
    expect(view.getUint32(directoryAt, true)).toBe(0x02014b50);

    // Each central record names an offset, and a local header stands there.
    const first = view.getUint32(directoryAt + 42, true);
    expect(view.getUint32(first, true)).toBe(0x04034b50);
  });

  it("is empty but still a zip when there is nothing to save", async () => {
    const raw = await bytes(buildZip([], AT));
    expect(raw.length).toBe(22);
    expect(new DataView(raw.buffer).getUint16(raw.length - 14, true)).toBe(0);
  });
});

describe("reading an archive back", () => {
  it("gives the entries as they went in", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const entries = [
      { name: "Regina.json", data: text('{"name":"Regina"}') },
      { name: "Regina-48.png", data: png },
    ];

    const read = readZip(await bytes(buildZip(entries, AT)));

    expect(read.map((entry) => entry.name)).toEqual(["Regina.json", "Regina-48.png"]);
    expect(new TextDecoder().decode(read[0]!.data)).toBe('{"name":"Regina"}');
    expect([...read[1]!.data]).toEqual([...png]);
  });

  it("refuses a file that is not one of ours rather than guessing", () => {
    expect(() => readZip(text("not a zip at all"))).toThrow(/not a zip/i);
  });
});

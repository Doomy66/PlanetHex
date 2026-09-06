import type { Planet } from "../planet";
import { parsePlanet } from "../planet";
import type { MapImages } from "./images";
import { buildZip, readZip, type ZipEntry } from "./zip";

/**
 * Local saves through the File System Access API. Spec.md 6.4.1.
 *
 * A save is a folder rather than a single file: the planet's JSON, and the map
 * images of 6.4.5 beside it. A file handle cannot reach the folder it came from,
 * so writing the images next to a file the user picked is not something the API
 * allows; the folder is what makes them one save rather than five errands.
 *
 * The handle for the open folder is held by the caller, so a second Save rewrites
 * the same files without prompting. The API is Chromium only, which isSupported
 * reports, and where it is missing the same save is offered as a zip through an
 * ordinary download and read back through an ordinary file input. That path
 * cannot rewrite what it wrote a moment ago, so every save is a fresh file, but
 * the folder of 6.4.1 arrives whole rather than as five errands.
 */

interface WritableStream {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
}
interface WritableFile {
  createWritable(): Promise<WritableStream>;
}
export interface FileHandle extends WritableFile {
  readonly name: string;
  getFile(): Promise<File>;
}
export interface DirectoryHandle {
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
}
interface PickerWindow {
  showDirectoryPicker?(options: unknown): Promise<DirectoryHandle>;
  showOpenFilePicker?(options: unknown): Promise<FileHandle[]>;
}

const PICKER_OPTIONS = {
  types: [{ description: "Planet", accept: { "application/json": [".json"] } }],
};

export function isSupported(): boolean {
  const w = window as unknown as PickerWindow;
  return typeof w.showDirectoryPicker === "function" && typeof w.showOpenFilePicker === "function";
}

export class PickerCancelled extends Error {}

function rethrow(error: unknown): never {
  if (error instanceof DOMException && error.name === "AbortError") throw new PickerCancelled();
  throw error;
}

/**
 * Ask for the folder to save into. Kept apart from writing because the picker
 * needs the click that opened it to still be the gesture in hand, and rendering
 * the images of 6.4.5 takes long enough to lose it.
 */
export async function pickFolder(): Promise<DirectoryHandle> {
  const w = window as unknown as PickerWindow;
  if (!w.showDirectoryPicker) throw new Error("This browser cannot save files in place.");
  try {
    return await w.showDirectoryPicker({ id: "planethex", mode: "readwrite" });
  } catch (error) {
    rethrow(error);
  }
}

/** The planet and its map images, written into a folder already chosen. */
export async function saveTo(
  dir: DirectoryHandle,
  planet: Planet,
  images: MapImages,
): Promise<void> {
  const stem = sanitise(planet.name);
  await write(dir, `${stem}.json`, JSON.stringify(planet, null, 2));
  for (const [size, png] of images) {
    // The row count of 2.2.2 names the file, since that is what the level is.
    await write(dir, `${stem}-${size}.png`, png);
  }
}

async function write(dir: DirectoryHandle, name: string, data: string | Blob): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function load(): Promise<{ planet: Planet; name: string }> {
  const w = window as unknown as PickerWindow;
  if (!w.showOpenFilePicker) throw new Error("This browser cannot open files.");
  let handles: FileHandle[];
  try {
    handles = await w.showOpenFilePicker(PICKER_OPTIONS);
  } catch (error) {
    rethrow(error);
  }
  const handle = handles[0];
  if (!handle) throw new PickerCancelled();
  const text = await (await handle.getFile()).text();
  return { planet: parsePlanet(text), name: handle.name };
}

/* The fallback, for a browser without the API above --------------------- */

/**
 * The save of 6.4.1 as a single archive: the planet's JSON and the images of
 * 6.4.5 under the same names a folder would have given them, so a save made in
 * Firefox and a save made in Chrome hold the same files.
 *
 * Separate from handing it to the browser so the archive can be tested without
 * a document to download it into.
 */
export async function zipSave(planet: Planet, images: MapImages): Promise<Blob> {
  const stem = sanitise(planet.name);
  const entries: ZipEntry[] = [
    { name: `${stem}.json`, data: new TextEncoder().encode(JSON.stringify(planet, null, 2)) },
  ];
  for (const [size, png] of images) {
    entries.push({ name: `${stem}-${size}.png`, data: new Uint8Array(await png.arrayBuffer()) });
  }
  return buildZip(entries);
}

/** What the downloaded archive is called. The save is named for the world. */
export function saveName(planet: Planet): string {
  return `${sanitise(planet.name)}.zip`;
}

/**
 * Hand a blob to the browser as a download. The anchor is put in the document
 * because a click on one outside it is ignored by some browsers, and taken out
 * again straight after.
 */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on a later turn: revoking it in this one can beat the download to
  // the URL, and the download is what the click was for.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Open a planet through a file input, for a browser with no picker. Both what a
 * save wrote are offered: the JSON on its own, and the archive holding it.
 */
export function loadFromInput(): Promise<{ planet: Planet; name: string }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.zip,application/json,application/zip";
    input.style.display = "none";

    const finish = (): void => input.remove();

    // Every browser that has no picker does fire this, and without it a
    // cancelled Load would leave the promise hanging and the input in the page.
    input.addEventListener("cancel", () => {
      finish();
      reject(new PickerCancelled());
    });

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      finish();
      if (!file) {
        reject(new PickerCancelled());
        return;
      }
      readPlanetFile(file).then(resolve, reject);
    });

    document.body.append(input);
    input.click();
  });
}

/** A planet out of whichever of the two files the user picked. */
async function readPlanetFile(file: File): Promise<{ planet: Planet; name: string }> {
  if (!/\.zip$/i.test(file.name)) {
    return { planet: parsePlanet(await file.text()), name: file.name };
  }
  const entries = readZip(new Uint8Array(await file.arrayBuffer()));
  const json = entries.find((entry) => /\.json$/i.test(entry.name));
  if (!json) throw new Error("That archive holds no planet.");
  return { planet: parsePlanet(new TextDecoder().decode(json.data)), name: json.name };
}

function sanitise(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 _-]/g, "").trim();
  return cleaned === "" ? "planet" : cleaned;
}

import type { Planet } from "../planet";
import { parsePlanet } from "../planet";
import type { MapImages } from "./images";

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
 * reports so the application can say so plainly rather than failing at the moment
 * the user clicks Save.
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

function sanitise(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 _-]/g, "").trim();
  return cleaned === "" ? "planet" : cleaned;
}

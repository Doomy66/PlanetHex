import type { Planet } from "../planet";
import { parsePlanet } from "../planet";
import { buildZip, readZip, type ZipEntry } from "./zip";

/**
 * Local saves through the File System Access API. PlanetSpec.md 6.4.1.
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
  /**
   * What is in the folder. AppSpec 5.6: a level above the planet is loaded by
   * picking its folder, and a folder cannot be read without listing it.
   */
  values?(): AsyncIterableIterator<FileHandle | DirectoryHandle>;
  getDirectoryHandle?(
    name: string,
    options?: { create?: boolean },
  ): Promise<DirectoryHandle>;
}
interface PickerWindow {
  showDirectoryPicker?(options: unknown): Promise<DirectoryHandle>;
  showOpenFilePicker?(options: unknown): Promise<FileHandle[]>;
}

/**
 * What each level's document is called on disk. AppSpec 4.1.1.
 *
 * JSON inside, but named for what it is: a folder of saves says at a glance
 * which file is the subsector and which are the worlds, and a referee looking for
 * their subsector does not have to open three files called something.json to
 * find out which one it is.
 */
export const LEVEL_SUFFIX = {
  planet: ".planet",
  system: ".system",
  subsector: ".subsector",
  sector: ".sector",
} as const;

/** Every suffix a document of this application can wear, including the old one. */
const DOCUMENT_SUFFIXES = [...Object.values(LEVEL_SUFFIX), ".json"];

/** Whether a file is one of this application's documents. */
export function isDocument(name: string): boolean {
  return DOCUMENT_SUFFIXES.some((suffix) => name.toLowerCase().endsWith(suffix));
}

const PICKER_OPTIONS = {
  types: [
    {
      description: "PlanetHex document",
      accept: { "application/json": DOCUMENT_SUFFIXES },
    },
  ],
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

/**
 * One file of a save, named in full. Spec 6.23.3.
 *
 * The save used to know what it wrote: a planet and four pictures. Now the user
 * chooses, and a format can write two files or none, so what arrives here is a
 * list rather than a planet and a map of images. Both halves of 6.4.1 take the
 * same list, which is what keeps a folder save and an archive save holding the
 * same files under the same names.
 */
export interface SaveFile {
  readonly name: string;
  readonly data: string | Blob;
}

/**
 * The name a planet's files are built on. Spec 6.4.1, AppSpec 4.2.1.
 *
 * Where the world is, not what it is called: a world of a system is named for
 * its place in that system, so the third world of Sol is Sol-3 whatever its
 * inhabitants call it. A world with no system has no place to be named for and
 * keeps its own name, which is AppSpec 4.2.4 - a planet rolled on its own is
 * still a planet, and this application began with nothing else.
 */
export function stemFor(planet: Planet): string {
  const designation = (planet.designation ?? "").trim();
  if (designation === "") return sanitise(planet.name);
  // A designation is a token rather than prose, so its spaces close up: the
  // first belt of Regina is "Regina Belt-1" to read and Regina-Belt-1 on disk.
  // A world's own name is left as it is written - a planet called New Hope is
  // New Hope.json, because that one is prose and prose has spaces in it.
  const token = sanitise(designation)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return token === "" ? sanitise(planet.name) : token;
}

/** The planet's own document, which every save writes whatever else it does. */
export function planetFile(planet: Planet): SaveFile {
  return {
    name: `${stemFor(planet)}${LEVEL_SUFFIX.planet}`,
    data: JSON.stringify(planet, null, 2),
  };
}

/**
 * The chosen files, written into a folder already chosen.
 *
 * A name with slashes in it is a path: the folders are made as it goes. That is
 * what lets one save write a level and its saved children in one pass, which is
 * the shape of folder the app spec section 4 asks for at every level, and it is
 * also exactly how a name behaves inside the archive of the fallback.
 */
export async function saveTo(dir: DirectoryHandle, files: readonly SaveFile[]): Promise<void> {
  for (const file of files) {
    const steps = file.name.split("/").filter((step) => step !== "");
    const name = steps.pop();
    if (name === undefined) continue;
    let into = dir;
    for (const step of steps) into = await folderIn(into, step);
    await write(into, name, file.data);
  }
}

async function folderIn(dir: DirectoryHandle, name: string): Promise<DirectoryHandle> {
  if (!dir.getDirectoryHandle) throw new Error("This browser cannot make folders.");
  return dir.getDirectoryHandle(name, { create: true });
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

/**
 * Every document sitting in a folder, with its text. Shallow: a level's save is
 * one document under the app spec 4.1.2, so what is in the folder is what there
 * is to read, and the levels below are reached by opening what is in it.
 */
export async function readFolder(dir: DirectoryHandle): Promise<{ name: string; text: string }[]> {
  if (!dir.values) throw new Error("This browser cannot read a folder.");
  const out: { name: string; text: string }[] = [];
  for await (const entry of dir.values()) {
    const handle = entry as FileHandle;
    if (typeof handle.getFile !== "function") continue;
    if (!isDocument(handle.name)) continue;
    out.push({ name: handle.name, text: await (await handle.getFile()).text() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ask for a folder and read what is in it. AppSpec 3.3: what is chosen is the
 * folder holding a level's data, not a file inside it, and the folder is the
 * save folder from that moment on.
 */
export async function loadFolder(): Promise<{
  dir: DirectoryHandle;
  files: { name: string; text: string }[];
}> {
  const dir = await pickFolder();
  return { dir, files: await readFolder(dir) };
}

/* The fallback, for a browser without the API above --------------------- */

/**
 * The save of 6.4.1 as a single archive, holding exactly the files a folder save
 * would have held, under the same names. A save made in Firefox and a save made
 * in Chrome hold the same things.
 *
 * Separate from handing it to the browser so the archive can be tested without
 * a document to download it into.
 */
export async function zipSave(files: readonly SaveFile[]): Promise<Blob> {
  const entries: ZipEntry[] = [];
  for (const file of files) {
    entries.push({
      name: file.name,
      data:
        typeof file.data === "string"
          ? new TextEncoder().encode(file.data)
          : new Uint8Array(await file.data.arrayBuffer()),
    });
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

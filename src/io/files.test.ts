import { describe, expect, it } from "vitest";
import {
  planetFile,
  saveTo,
  stemFor,
  zipSave,
  type DirectoryHandle,
  type FileHandle,
  type SaveFile,
} from "./files";
import { readZip } from "./zip";
import { newPlanet } from "../planet";

/**
 * The folder a save writes into, stubbed. Spec 6.4.1: whatever the dialogue of
 * 6.23 asked for goes in together, and what matters here is that every file the
 * caller handed over is written, under the name it was handed over with.
 */
function fakeFolder(): { handle: DirectoryHandle; written: Map<string, string | Blob> } {
  const written = new Map<string, string | Blob>();
  const handle: DirectoryHandle = {
    name: "Worlds",
    getFileHandle: async (name) => {
      const file: FileHandle = {
        name,
        getFile: async () => new File([], name),
        createWritable: async () => {
          let data: string | Blob = "";
          return {
            write: async (chunk) => {
              data = chunk;
            },
            close: async () => {
              written.set(name, data);
            },
          };
        },
      };
      return file;
    },
  };
  return { handle, written };
}

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

/** A save of the shape the application builds: the planet, then its pictures. */
function saveOf(planet: ReturnType<typeof newPlanet>, levels: number[] = []): SaveFile[] {
  const stem = stemFor(planet);
  return [
    planetFile(planet),
    ...levels.map((size) => ({ name: `${stem}-${size}.png`, data: png() })),
  ];
}

describe("naming a planet's files", () => {
  // Spec 6.4.1: a save is a folder of files, and a name with a slash in it would
  // be a path rather than a name.
  it("keeps an awkward planet name out of the file names", () => {
    expect(stemFor({ ...newPlanet(), name: "Regina/Credo: 2?" })).toBe("ReginaCredo 2");
  });

  it("falls back to a name rather than writing a file called nothing", () => {
    expect(stemFor({ ...newPlanet(), name: "  " })).toBe("planet");
  });
});

describe("saving a planet to a folder", () => {
  it("writes every file it is given", async () => {
    const { handle, written } = fakeFolder();
    const planet = { ...newPlanet(), name: "Regina" };

    await saveTo(handle, saveOf(planet, [6, 12, 24, 48, 96]));

    expect([...written.keys()].sort()).toEqual([
      "Regina-12.png",
      "Regina-24.png",
      "Regina-48.png",
      "Regina-6.png",
      "Regina-96.png",
      "Regina.json",
    ]);
  });

  // Spec 6.23.1: the levels are the user's to choose, and choosing none is a
  // choice. The planet still goes, because a save without it is not a save.
  it("writes the planet alone where no other file was asked for", async () => {
    const { handle, written } = fakeFolder();
    const planet = { ...newPlanet(), name: "Regina" };

    await saveTo(handle, saveOf(planet));

    expect([...written.keys()]).toEqual(["Regina.json"]);
  });

  it("writes the planet as the JSON a load can read back", async () => {
    const { handle, written } = fakeFolder();
    const planet = { ...newPlanet(), name: "Regina", narrative: "A world." };

    await saveTo(handle, saveOf(planet));

    expect(JSON.parse(written.get("Regina.json") as string)).toEqual(planet);
  });

  // A format writes text, and text has to arrive as the bytes it was written as.
  it("writes an exported file under the name it was given", async () => {
    const { handle, written } = fakeFolder();

    await saveTo(handle, [{ name: "Regina.md", data: "# Regina\n" }]);

    expect(written.get("Regina.md")).toBe("# Regina\n");
  });
});

/**
 * The same save on a browser with no File System Access API. Spec 6.4.1: a save
 * is the planet and whatever was asked for beside it, and the archive is how
 * they stay together when there is no folder to put them in.
 */
describe("saving a planet as an archive", () => {
  const entriesOf = async (files: SaveFile[]) =>
    readZip(new Uint8Array(await (await zipSave(files)).arrayBuffer()));

  it("holds the same files a folder would have held", async () => {
    const planet = { ...newPlanet(), name: "Regina" };

    const entries = await entriesOf(saveOf(planet, [6, 12, 24, 48, 96]));

    expect(entries.map((entry) => entry.name).sort()).toEqual([
      "Regina-12.png",
      "Regina-24.png",
      "Regina-48.png",
      "Regina-6.png",
      "Regina-96.png",
      "Regina.json",
    ]);
  });

  it("holds the planet as the JSON a load can read back", async () => {
    const planet = { ...newPlanet(), name: "Regina", narrative: "A world." };

    const entries = await entriesOf(saveOf(planet));
    const json = entries.find((entry) => entry.name === "Regina.json");

    expect(JSON.parse(new TextDecoder().decode(json!.data))).toEqual(planet);
  });

  it("holds an exported file's text as it was written", async () => {
    const entries = await entriesOf([{ name: "Regina.csv", data: "hex\r\nF00R00C00\r\n" }]);

    expect(new TextDecoder().decode(entries[0]!.data)).toBe("hex\r\nF00R00C00\r\n");
  });
});

import { describe, expect, it } from "vitest";
import { saveTo, zipSave, type DirectoryHandle, type FileHandle } from "./files";
import { readZip } from "./zip";
import { newPlanet } from "../planet";

/**
 * The folder a save writes into, stubbed. Spec 6.4.1: the planet's JSON and the
 * images of 6.4.5 go in together, and what matters here is that they are all
 * written, under the names that say which is which.
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

describe("saving a planet to a folder", () => {
  it("writes the planet and one image per detail level", async () => {
    const { handle, written } = fakeFolder();
    const planet = { ...newPlanet(), name: "Regina" };
    const images = new Map([
      [6, png()],
      [12, png()],
      [24, png()],
      [48, png()],
    ]);

    await saveTo(handle, planet, images);

    expect([...written.keys()].sort()).toEqual([
      "Regina-12.png",
      "Regina-24.png",
      "Regina-48.png",
      "Regina-6.png",
      "Regina.json",
    ]);
  });

  it("writes the planet as the JSON a load can read back", async () => {
    const { handle, written } = fakeFolder();
    const planet = { ...newPlanet(), name: "Regina", narrative: "A world." };

    await saveTo(handle, planet, new Map());

    expect(JSON.parse(written.get("Regina.json") as string)).toEqual(planet);
  });

  // Spec 6.4.1: a save is a folder of files, and a name with a slash in it would
  // be a path rather than a name.
  it("keeps an awkward planet name out of the file names", async () => {
    const { handle, written } = fakeFolder();
    const planet = { ...newPlanet(), name: "Regina/Credo: 2?" };

    await saveTo(handle, planet, new Map([[6, png()]]));

    expect([...written.keys()].sort()).toEqual(["ReginaCredo 2-6.png", "ReginaCredo 2.json"]);
  });

  it("falls back to a name rather than writing a file called nothing", async () => {
    const { handle, written } = fakeFolder();
    const planet = { ...newPlanet(), name: "  " };

    await saveTo(handle, planet, new Map());

    expect([...written.keys()]).toEqual(["planet.json"]);
  });
});

/**
 * The same save on a browser with no File System Access API. Spec 6.4.1: a save
 * is the planet and its maps together, and the archive is how they stay
 * together when there is no folder to put them in.
 */
describe("saving a planet as an archive", () => {
  it("holds the same files a folder would have held", async () => {
    const planet = { ...newPlanet(), name: "Regina" };
    const images = new Map([
      [6, png()],
      [12, png()],
      [24, png()],
      [48, png()],
    ]);

    const entries = readZip(new Uint8Array(await (await zipSave(planet, images)).arrayBuffer()));

    expect(entries.map((entry) => entry.name).sort()).toEqual([
      "Regina-12.png",
      "Regina-24.png",
      "Regina-48.png",
      "Regina-6.png",
      "Regina.json",
    ]);
  });

  it("holds the planet as the JSON a load can read back", async () => {
    const planet = { ...newPlanet(), name: "Regina", narrative: "A world." };

    const entries = readZip(new Uint8Array(await (await zipSave(planet, new Map())).arrayBuffer()));
    const json = entries.find((entry) => entry.name === "Regina.json");

    expect(JSON.parse(new TextDecoder().decode(json!.data))).toEqual(planet);
  });

  it("keeps an awkward planet name out of the entry names", async () => {
    const planet = { ...newPlanet(), name: "Regina/Credo: 2?" };

    const entries = readZip(new Uint8Array(await (await zipSave(planet, new Map([[6, png()]]))).arrayBuffer()));

    expect(entries.map((entry) => entry.name).sort()).toEqual([
      "ReginaCredo 2-6.png",
      "ReginaCredo 2.json",
    ]);
  });
});

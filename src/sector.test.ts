import { describe, expect, it } from "vitest";
import {
  keepSubsector,
  newSectorDoc,
  parseSectorDoc,
  savedSubsector,
  sectorOf,
  subsectorIn,
} from "./sector";
import { generateSector, subsectorSeedFor, SECTOR_HEXES } from "./gen/sector";
import { generateSubsector } from "./gen/subsector";
import { setOverride, subsectorOf } from "./subsector";
import { hexDistance, subsectorLetter, parseSectorHex, SUBSECTOR_LETTERS } from "./location";

const SEED = "SPINWARD";
const sector = generateSector(SEED, "standard");

describe("a whole sector", () => {
  it("is sixteen subsectors and nothing else", () => {
    // SectorSpec 3.1: the same arithmetic one level up, and no new arithmetic.
    expect(sector.subsectors).toHaveLength(16);
    expect(sector.subsectors.map((held) => held.letter).join("")).toBe(SUBSECTOR_LETTERS);
  });

  it("gives each subsector the chart its own seed makes", () => {
    // The claim the chain is built on, at this level: a subsector opened out of
    // a sector is the subsector that seed makes on its own. AppSpec 1.3.
    for (const held of sector.subsectors) {
      const alone = generateSubsector(subsectorSeedFor(SEED, held.letter), held.letter, "standard");
      expect(held.worlds.map((world) => world.uwp)).toEqual(alone.worlds.map((world) => world.uwp));
    }
  });

  it("puts every world in the subsector its hex falls in", () => {
    for (const held of sector.subsectors) {
      for (const world of held.worlds) {
        expect(subsectorLetter(parseSectorHex(world.at)!), world.at).toBe(held.letter);
      }
    }
  });

  it("holds about half the sector's hexes at standard density", () => {
    const share = sector.worlds.length / SECTOR_HEXES;
    expect(share).toBeGreaterThan(0.44);
    expect(share).toBeLessThan(0.56);
  });

  it("leans every subsector the way the sector leans", () => {
    const settled = generateSector(SEED, "standard", { population: 3 });
    const average = (held: typeof sector) =>
      held.worlds.reduce((sum, world) => sum + world.profile.population, 0) / held.worlds.length;
    expect(average(settled)).toBeGreaterThan(average(sector) + 1);
  });
});

describe("what only the sector can see", () => {
  it("joins worlds across a subsector's edge", () => {
    // SectorSpec 3.3. A route between two worlds either side of an edge was
    // invisible to both of the subsectors it joined.
    const crossing = sector.routes.filter(
      (route) => subsectorLetter(parseSectorHex(route.from)!) !== subsectorLetter(parseSectorHex(route.to)!),
    );
    expect(crossing.length).toBeGreaterThan(0);
    const within = sector.subsectors.reduce((count, held) => count + held.routes.length, 0);
    expect(sector.routes.length).toBeGreaterThan(within);
  });

  it("runs a Main past the edge a subsector stops at", () => {
    // SectorSpec 3.4 and the subsector spec 3.10.5: a chart is eight by ten and
    // a Main can run the width of a sector.
    const biggest = sector.mains[0]!;
    const inOne = Math.max(...sector.subsectors.map((held) => held.mains[0]?.hexes.length ?? 0));
    expect(biggest.hexes.length).toBeGreaterThan(inOne);
    const letters = new Set(biggest.hexes.map((at) => subsectorLetter(parseSectorHex(at)!)));
    expect(letters.size).toBeGreaterThan(1);
  });

  it("keeps every Main a jump-1 chain however far it runs", () => {
    const where = new Map(sector.worlds.map((world) => [world.at, world]));
    for (const main of sector.mains.slice(0, 3)) {
      for (const at of main.hexes) {
        const near = main.hexes.some(
          (other) => other !== at && hexDistance(where.get(at)!.hex, where.get(other)!.hex) === 1,
        );
        expect(near, at).toBe(true);
      }
    }
  });
});

describe("a sector document", () => {
  it("rebuilds from the seed and nothing else", () => {
    const doc = newSectorDoc(SEED, "Spinward Marches");
    expect(sectorOf(doc).worlds.map((w) => w.uwp)).toEqual(sector.worlds.map((w) => w.uwp));
    expect(JSON.stringify(doc)).not.toContain(sector.worlds[0]!.uwp);
  });

  it("hands its density and its lean down to a chart opened from it", () => {
    // SectorSpec 7.1: a chart pulled out of a sector should look like the rest
    // of the sector rather than like one rolled from nowhere.
    const doc = newSectorDoc(SEED, "Spinward Marches", "dense");
    doc.shifts = { population: 2, tech: -1 };
    const held = subsectorIn(doc, "C");
    expect(held.seed).toBe(subsectorSeedFor(SEED, "C"));
    expect(held.density).toBe("dense");
    expect(held.shifts).toEqual({ population: 2, tech: -1 });
    expect(held.sector).toBe("Spinward Marches");
  });

  it("gives back the chart the referee left", () => {
    const doc = newSectorDoc(SEED);
    const held = subsectorIn(doc, "C");
    setOverride(held, subsectorOf(held).worlds[0]!.at, "name", "Hadley's Hope");
    keepSubsector(doc, "C", held);
    expect(savedSubsector(doc, "C")).toBe(held);
    expect(subsectorIn(doc, "C").overrides).toHaveLength(1);
  });

  it("carries the worked up charts through a save and back", () => {
    const doc = newSectorDoc(SEED, "Spinward Marches");
    const held = subsectorIn(doc, "C");
    setOverride(held, subsectorOf(held).worlds[0]!.at, "note", "Pirates.");
    keepSubsector(doc, "C", held);
    const back = parseSectorDoc(JSON.stringify(doc));
    expect(back.subsectors).toHaveLength(1);
    expect(savedSubsector(back, "C")?.overrides[0]?.note).toBe("Pirates.");
  });

  it("carries nothing until something is worked on", () => {
    const doc = newSectorDoc(SEED, "Spinward Marches");
    expect(parseSectorDoc(JSON.stringify(doc))).toEqual(doc);
    expect(doc.subsectors).toEqual([]);
  });
});

describe("reading a sector back", () => {
  it("refuses a file of another level", () => {
    const held = JSON.stringify({ level: "subsector", version: 1, seed: "X", letter: "C" });
    expect(() => parseSectorDoc(held)).toThrow(/subsector.*not a sector/);
  });

  it("refuses one with no seed, which cannot be rebuilt", () => {
    expect(() => parseSectorDoc(JSON.stringify({ level: "sector", version: 1 }))).toThrow(/no seed/);
  });

  it("refuses a version it does not understand", () => {
    const held = JSON.stringify({ level: "sector", version: 9, seed: "X" });
    expect(() => parseSectorDoc(held)).toThrow(/version 9/);
  });

  it("drops a chart under no letter of the sixteen", () => {
    const held = JSON.stringify({
      level: "sector",
      version: 1,
      seed: SEED,
      subsectors: [{ letter: "Q", doc: {} }, { letter: "C", doc: {} }],
    });
    // Both are dropped: one for its letter, one for not being a chart at all.
    expect(parseSectorDoc(held).subsectors).toEqual([]);
  });
});

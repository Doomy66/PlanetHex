import { describe, expect, it } from "vitest";
import { generateSystem, mainWorldSeed } from "./gen/system";
import { rollUwp } from "./planet";
import {
  newSystemDoc,
  overrideFor,
  parseSystemDoc,
  setOverride,
  subsectorLetterOf,
  systemOf,
} from "./system";

const SEED = "REGINA42";

describe("a system document", () => {
  it("holds a seed, a name and nothing generated", () => {
    // SystemSpec 9.2: no orbit, world or surface is stored. What the document
    // does carry of the generated system is the main world's profile, under 9.1.
    const doc = newSystemDoc(SEED, "Regina");
    expect(doc.level).toBe("system");
    expect(doc.seed).toBe(SEED);
    expect(doc.mainWorldUwp).toBe(rollUwp(mainWorldSeed(SEED)));
    expect(doc.overrides).toHaveLength(0);
    expect(JSON.stringify(doc)).not.toContain("orbit");
  });

  it("rebuilds the same system the seed makes", () => {
    expect(systemOf(newSystemDoc(SEED, "Regina"))).toEqual(generateSystem(SEED));
  });

  it("reads a saved document back as the system it was", () => {
    const doc = newSystemDoc(SEED, "Regina");
    setOverride(doc, 3, "note", "The refuelling station is still crewed.");
    const back = parseSystemDoc(JSON.stringify(doc));
    expect(back).toEqual(doc);
    expect(systemOf(back)).toEqual(systemOf(doc));
  });
});

describe("overrides", () => {
  it("stores only what was changed", () => {
    // SystemSpec 9.3 and 5.3.1: a system nobody has edited saves as its seed and
    // nothing else, so a later change to the generator improves what nobody has
    // touched and leaves alone what they have.
    const doc = newSystemDoc(SEED, "Regina");
    setOverride(doc, 2, "note", "Belt mining, three claims.");
    expect(doc.overrides).toEqual([{ orbit: 2, note: "Belt mining, three claims." }]);
  });

  it("takes an override back when the field is emptied", () => {
    const doc = newSystemDoc(SEED, "Regina");
    setOverride(doc, 2, "note", "A note.");
    setOverride(doc, 2, "name", "Tanith");
    setOverride(doc, 2, "note", "  ");
    expect(overrideFor(doc, 2)).toEqual({ orbit: 2, name: "Tanith" });
    setOverride(doc, 2, "name", "");
    expect(doc.overrides).toHaveLength(0);
  });

  it("lays a typed profile over the one that was rolled", () => {
    const doc = newSystemDoc(SEED, "Regina");
    const main = generateSystem(SEED).mainWorld;
    setOverride(doc, main.orbitIndex, "uwp", "A788899-C");
    const system = systemOf(doc);
    expect(system.mainWorld.uwp).toBe("A788899-C");
    const orbit = system.orbits.find((held) => held.index === main.orbitIndex)!;
    expect(orbit.content.kind === "world" && orbit.content.uwp).toBe("A788899-C");
    // The seed is untouched: the world is still the world its seed makes,
    // wearing what the referee wrote on it. SystemSpec 9.4.
    expect(system.mainWorld.seed).toBe(main.seed);
  });

  it("keeps the profile the document was saved with", () => {
    // A generator that has since changed its mind does not get to change a
    // referee's system under them. SystemSpec 9.1.
    const doc = newSystemDoc(SEED, "Regina");
    doc.mainWorldUwp = "X000000-0";
    expect(systemOf(doc).mainWorld.uwp).toBe("X000000-0");
  });
});

describe("reading a file", () => {
  it("refuses a document of another level", () => {
    expect(() => parseSystemDoc(JSON.stringify({ level: "planet", version: 1 }))).toThrow(
      /not a system/,
    );
  });

  it("refuses a version it does not know", () => {
    expect(() =>
      parseSystemDoc(JSON.stringify({ level: "system", version: 7, seed: SEED })),
    ).toThrow(/version 7/);
  });

  it("refuses a document with no seed, since nothing can be rebuilt without one", () => {
    expect(() => parseSystemDoc(JSON.stringify({ level: "system", version: 1 }))).toThrow(
      /no seed/,
    );
  });

  it("refuses what is not JSON at all", () => {
    expect(() => parseSystemDoc("not a file")).toThrow(/valid JSON/);
  });

  it("drops override entries that say nothing", () => {
    const doc = parseSystemDoc(
      JSON.stringify({
        level: "system",
        version: 1,
        seed: SEED,
        overrides: [{ orbit: 1 }, { orbit: 2, note: "kept" }, { note: "no orbit" }, 7],
      }),
    );
    expect(doc.overrides).toEqual([{ orbit: 2, note: "kept" }]);
  });
});

describe("where a system sits", () => {
  it("derives the subsector letter from the hex and never stores it", () => {
    const doc = newSystemDoc(SEED, "Regina");
    expect(subsectorLetterOf(doc)).toBe("");
    doc.hex = "1910";
    expect(subsectorLetterOf(doc)).toBe("C");
    doc.hex = "nonsense";
    expect(subsectorLetterOf(doc)).toBe("");
  });

  // The letter follows from the hex; what the subsector is called does not, so
  // the name is a field of its own and is stored.
  it("keeps a typed subsector name", () => {
    const doc = parseSystemDoc(
      JSON.stringify({ ...newSystemDoc(SEED, "Regina"), subsector: "Aramis" }),
    );
    expect(doc.subsector).toBe("Aramis");
  });

  it("gives a save written without one an empty subsector", () => {
    const doc = parseSystemDoc(JSON.stringify({ level: "system", version: 1, seed: SEED }));
    expect(doc.subsector).toBe("");
  });
});

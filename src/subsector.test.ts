import { describe, expect, it } from "vitest";
import {
  newSubsectorDoc,
  overrideFor,
  parseSubsectorDoc,
  setOverride,
  setPresence,
  subsectorOf,
} from "./subsector";
import { generateSubsector } from "./gen/subsector";
import { formatSectorHex, subsectorHexes } from "./location";

const SEED = "REGINA42";

/** A document and the chart it makes, with a hex that holds a world. */
function opened() {
  const doc = newSubsectorDoc(SEED, "C", "standard", "Regina");
  const chart = subsectorOf(doc);
  const world = chart.worlds[0]!;
  return { doc, chart, world };
}

describe("a subsector document", () => {
  it("rebuilds the chart from the seed and nothing else", () => {
    // SubSectorSpec 5.2: no generated world is stored.
    const { doc, chart } = opened();
    expect(chart.worlds).toEqual(generateSubsector(SEED, "C", "standard").worlds);
    expect(JSON.stringify(doc)).not.toContain(chart.worlds[0]!.uwp);
  });

  it("saves as its seed and nothing else until something is edited", () => {
    // 5.3.1: a chart read and not edited carries no overrides at all.
    const { doc } = opened();
    expect(doc.overrides).toEqual([]);
    const back = parseSubsectorDoc(JSON.stringify(doc));
    expect(back).toEqual(doc);
  });

  it("carries name, sector, letter, seed and density through a save", () => {
    // 5.1, the whole stored table.
    const doc = newSubsectorDoc("VLAND7QX", "G", "dense", "Vland Reach");
    doc.sector = "Vland";
    const back = parseSubsectorDoc(JSON.stringify(doc));
    expect(back.name).toBe("Vland Reach");
    expect(back.sector).toBe("Vland");
    expect(back.letter).toBe("G");
    expect(back.seed).toBe("VLAND7QX");
    expect(back.density).toBe("dense");
  });
});

describe("what a referee writes over a hex", () => {
  it("shows the name they typed instead of the one that was rolled", () => {
    const { doc, world } = opened();
    setOverride(doc, world.at, "name", "Hadley's Hope");
    const after = subsectorOf(doc).worlds.find((held) => held.at === world.at)!;
    expect(after.name).toBe("Hadley's Hope");
    expect(after.seed).toBe(world.seed);
  });

  it("never changes the world's seed", () => {
    // 5.3.3: the seed is the world, the override is what the referee says.
    const { doc, world } = opened();
    setOverride(doc, world.at, "uwp", "A867977-C");
    const after = subsectorOf(doc).worlds.find((held) => held.at === world.at)!;
    expect(after.seed).toBe(world.seed);
    expect(after.systemSeed).toBe(world.systemSeed);
  });

  it("works the trade codes out again from the profile they typed", () => {
    const { doc, world } = opened();
    setOverride(doc, world.at, "uwp", "A000977-C");
    const after = subsectorOf(doc).worlds.find((held) => held.at === world.at)!;
    expect(after.uwp).toBe("A000977-C");
    expect(after.profile.starport).toBe("A");
    expect(after.trade.map((code) => code.code)).toContain("As");
  });

  it("leaves a half typed profile alone", () => {
    // A referee mid-keystroke should not have the world blanked under them.
    const { doc, world } = opened();
    setOverride(doc, world.at, "uwp", "A86");
    const after = subsectorOf(doc).worlds.find((held) => held.at === world.at)!;
    expect(after.uwp).toBe(world.uwp);
  });

  it("stores only the fields that were changed", () => {
    const { doc, world } = opened();
    setOverride(doc, world.at, "zone", "R");
    expect(overrideFor(doc, world.at)).toEqual({ at: world.at, zone: "R" });
  });

  it("forgets a field emptied back out", () => {
    // 5.3.1 again: an override the referee has emptied is one they took back.
    const { doc, world } = opened();
    setOverride(doc, world.at, "note", "Pirates.");
    expect(doc.overrides).toHaveLength(1);
    setOverride(doc, world.at, "note", "   ");
    expect(doc.overrides).toEqual([]);
  });

  it("puts a system into a hex the density left empty", () => {
    // 5.3.4: dropping written work to a slider is what this prevents.
    const { doc, chart } = opened();
    const empty = subsectorHexes("C")
      .map(formatSectorHex)
      .find((at) => !chart.worlds.some((world) => world.at === at))!;
    setPresence(doc, empty, true, false);
    const after = subsectorOf(doc);
    expect(after.worlds.some((world) => world.at === empty)).toBe(true);
  });

  it("takes a system out of a hex the density filled", () => {
    const { doc, world } = opened();
    setPresence(doc, world.at, false, true);
    expect(subsectorOf(doc).worlds.some((held) => held.at === world.at)).toBe(false);
  });

  it("stores nothing where the referee agrees with the roll", () => {
    const { doc, world } = opened();
    setPresence(doc, world.at, true, true);
    expect(doc.overrides).toEqual([]);
  });

  it("keeps an override on a hex the density has since emptied", () => {
    // The written work survives the slider, which is the whole point of 5.3.4.
    const doc = newSubsectorDoc(SEED, "C", "dense", "Regina");
    const dense = subsectorOf(doc);
    const only = dense.worlds.find(
      (world) => !generateSubsector(SEED, "C", "rift").worlds.some((w) => w.at === world.at),
    )!;
    setOverride(doc, only.at, "note", "The refuelling stop.");
    doc.density = "rift";
    expect(overrideFor(doc, only.at)?.note).toBe("The refuelling stop.");
    const back = parseSubsectorDoc(JSON.stringify(doc));
    expect(overrideFor(back, only.at)?.note).toBe("The refuelling stop.");
  });

  it("carries the overrides through a save and back", () => {
    const { doc, world } = opened();
    setOverride(doc, world.at, "name", "Hadley's Hope");
    setOverride(doc, world.at, "zone", "R");
    setOverride(doc, world.at, "note", "Nobody answers.");
    const back = parseSubsectorDoc(JSON.stringify(doc));
    expect(back.overrides).toEqual(doc.overrides);
    expect(subsectorOf(back).worlds.find((held) => held.at === world.at)!.zone).toBe("R");
  });
});

describe("which way a region leans", () => {
  // SubSectorSpec 3.11. A modifier on the dice every world here is rolled with,
  // not a number written over the answer afterwards.
  const leaning = (population: number, tech: number) => {
    const doc = newSubsectorDoc(SEED, "C", "standard", "Regina");
    doc.shifts = { population, tech };
    return subsectorOf(doc);
  };
  const average = (
    chart: ReturnType<typeof leaning>,
    of: "population" | "tech" | "government" | "law",
  ) =>
    chart.worlds.reduce((sum, world) => sum + world.profile[of], 0) / chart.worlds.length;

  it("settles a region when it is leaned towards people", () => {
    expect(average(leaning(2, 0), "population")).toBeGreaterThan(
      average(leaning(0, 0), "population") + 1,
    );
  });

  it("empties one when it is leaned away", () => {
    expect(average(leaning(-2, 0), "population")).toBeLessThan(
      average(leaning(0, 0), "population") - 1,
    );
  });

  it("carries a population lean into the government and the law", () => {
    // 3.11.2: the digits that follow from population follow it here too, which
    // is what a figure written over the top afterwards would have missed.
    expect(average(leaning(3, 0), "government")).toBeGreaterThan(average(leaning(0, 0), "government"));
    expect(average(leaning(3, 0), "law")).toBeGreaterThan(average(leaning(0, 0), "law"));
  });

  it("raises the tech of a region on its own", () => {
    const flat = leaning(0, 0);
    const high = leaning(0, 3);
    expect(average(high, "tech")).toBeGreaterThan(average(flat, "tech"));
    // And leaves the people where they were: the two are separate thumbs.
    expect(average(high, "population")).toBe(average(flat, "population"));
  });

  it("leaves the worlds where they are", () => {
    // A lean changes what is on a world, not which hexes hold one: a referee who
    // has annotated a chart and then settles the region keeps their chart.
    const flat = leaning(0, 0);
    const high = leaning(3, 3);
    expect(high.worlds.map((world) => world.at)).toEqual(flat.worlds.map((world) => world.at));
    expect(high.worlds.map((world) => world.seed)).toEqual(flat.worlds.map((world) => world.seed));
  });

  it("carries the lean through a save and back", () => {
    const doc = newSubsectorDoc(SEED, "C", "standard", "Regina");
    doc.shifts = { population: -1, tech: 2 };
    const back = parseSubsectorDoc(JSON.stringify(doc));
    expect(back.shifts).toEqual({ population: -1, tech: 2 });
    expect(subsectorOf(back).worlds[0]!.uwp).toBe(subsectorOf(doc).worlds[0]!.uwp);
  });

  it("holds a lean to what a modifier on two dice can sensibly be", () => {
    // 3.11.1. Past three the dice have stopped mattering.
    const doc = JSON.stringify({
      level: "subsector",
      version: 1,
      seed: SEED,
      letter: "C",
      shifts: { population: 99, tech: -99 },
    });
    expect(parseSubsectorDoc(doc).shifts).toEqual({ population: 3, tech: -3 });
  });

  it("reads a document written before leaning as level", () => {
    const doc = JSON.stringify({ level: "subsector", version: 1, seed: SEED, letter: "C" });
    expect(parseSubsectorDoc(doc).shifts).toEqual({ population: 0, tech: 0 });
  });
});

describe("reading a document back", () => {
  it("refuses a file of another level", () => {
    const planet = JSON.stringify({ level: "system", version: 1, seed: "X" });
    expect(() => parseSubsectorDoc(planet)).toThrow(/system.*not a subsector/);
  });

  it("refuses a document with no seed, which cannot be rebuilt", () => {
    const doc = JSON.stringify({ level: "subsector", version: 1, letter: "C" });
    expect(() => parseSubsectorDoc(doc)).toThrow(/no seed/);
  });

  it("refuses a letter that is not one of the sixteen", () => {
    const doc = JSON.stringify({ level: "subsector", version: 1, seed: "X", letter: "Q" });
    expect(() => parseSubsectorDoc(doc)).toThrow(/not a subsector letter/);
  });

  it("refuses a version it does not understand", () => {
    const doc = JSON.stringify({ level: "subsector", version: 2, seed: "X", letter: "C" });
    expect(() => parseSubsectorDoc(doc)).toThrow(/version 2/);
  });

  it("falls back to the standard density rather than refusing", () => {
    // A density it does not know is a field it can do without, not a document
    // it has to reject: the seed and the letter are what it cannot rebuild from.
    const doc = JSON.stringify({
      level: "subsector",
      version: 1,
      seed: "X",
      letter: "C",
      density: "crowded",
    });
    expect(parseSubsectorDoc(doc).density).toBe("standard");
  });

  it("drops an override that says nothing and one on no hex at all", () => {
    const doc = JSON.stringify({
      level: "subsector",
      version: 1,
      seed: "X",
      letter: "C",
      overrides: [{ at: "0101" }, { at: "nowhere", name: "Ghost" }, { at: "0102", name: "Kept" }],
    });
    expect(parseSubsectorDoc(doc).overrides).toEqual([{ at: "0102", name: "Kept" }]);
  });
});

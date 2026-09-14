import { describe, expect, it } from "vitest";
import { parseSectorHex, subsectorHexes, subsectorLetter } from "../location";
import { mainWorldSeed } from "./system";
import { rollUwp } from "../planet";
import {
  DENSITIES,
  generateSubsector,
  holdsSystem,
  systemSeedFor,
  type Density,
} from "./subsector";
import { subsectorFile } from "../io/export/subsector";

const SEEDS = Array.from({ length: 40 }, (_, i) => `chart-${i}`);

describe("the eighty hexes", () => {
  it("gives every subsector its own square of the chart", () => {
    // SubSectorSpec 2.1.1 and 2.2.2: eight across and ten down, numbered where
    // that subsector sits on the sector chart rather than from its own corner.
    for (const letter of "ABCDEFGHIJKLMNOP") {
      const hexes = subsectorHexes(letter);
      expect(hexes, letter).toHaveLength(80);
      for (const hex of hexes) {
        expect(subsectorLetter(hex), `${letter} ${hex.col},${hex.row}`).toBe(letter);
      }
    }
  });

  it("covers the whole sector between them and overlaps nowhere", () => {
    const seen = new Set<string>();
    for (const letter of "ABCDEFGHIJKLMNOP") {
      for (const hex of subsectorHexes(letter)) seen.add(`${hex.col}:${hex.row}`);
    }
    expect(seen.size).toBe(32 * 40);
  });
});

describe("where the systems are", () => {
  it("puts about as many systems out as the density asks for", () => {
    for (const density of Object.keys(DENSITIES) as Density[]) {
      let worlds = 0;
      for (const seed of SEEDS) worlds += generateSubsector(seed, "A", density).worlds.length;
      const share = worlds / (SEEDS.length * 80);
      expect(Math.abs(share - DENSITIES[density]), density).toBeLessThan(0.06);
    }
  });

  it("only ever adds systems as the density rises", () => {
    // SubSectorSpec 3.2.2.1. A referee who has written notes on half a chart and
    // then decides the region should be busier keeps the half they wrote.
    const order: Density[] = ["rift", "sparse", "standard", "dense"];
    for (const seed of SEEDS) {
      let before = new Set<string>();
      for (const density of order) {
        const now = new Set(generateSubsector(seed, "A", density).worlds.map((w) => w.at));
        for (const at of before) expect(now.has(at), `${seed} ${density} ${at}`).toBe(true);
        before = now;
      }
    }
  });

  it("agrees with itself about which hexes hold systems", () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const chart = generateSubsector(seed, "C", "standard");
      for (const hex of subsectorHexes("C")) {
        const at = `${String(hex.col).padStart(2, "0")}${String(hex.row).padStart(2, "0")}`;
        const here = chart.worlds.some((world) => world.at === at);
        expect(holdsSystem(seed, at, "standard"), at).toBe(here);
      }
    }
  });
});

describe("what the chart holds", () => {
  const chart = generateSubsector("REGINA42", "C", "standard");

  it("shows the profile the world's own seed rolls", () => {
    // The claim the whole chain is built on, at this level: the chart names
    // seeds rather than inventing worlds. SubSectorSpec 1.3.1.
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        expect(world.systemSeed).toBe(systemSeedFor(seed, world.at));
        expect(world.seed).toBe(mainWorldSeed(world.systemSeed));
        expect(world.uwp, world.at).toBe(rollUwp(world.seed));
      }
    }
  });

  it("puts every world on a square of the chart", () => {
    for (const world of chart.worlds) {
      expect(parseSectorHex(world.at), world.at).not.toBeNull();
      expect(subsectorLetter(world.hex)).toBe("C");
    }
  });

  it("gives bases only to the ports that can carry them", () => {
    // SubSectorSpec 3.5.1: naval at A and B, scout at A through D, neither
    // anywhere else.
    let naval = 0;
    let scout = 0;
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        const port = world.profile.starport;
        if (world.bases === "N" || world.bases === "A") {
          naval++;
          expect("AB", `${world.at} ${world.uwp}`).toContain(port);
        }
        if (world.bases === "S" || world.bases === "A") {
          scout++;
          expect("ABCD", `${world.at} ${world.uwp}`).toContain(port);
        }
      }
    }
    expect(naval).toBeGreaterThan(0);
    expect(scout).toBeGreaterThan(0);
  });

  it("marks amber where the profile earns it and red nowhere", () => {
    // SubSectorSpec 3.6.2: red is a referee's decision about their own campaign,
    // and nothing in a profile knows that.
    let amber = 0;
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        expect(world.zone).not.toBe("R");
        if (world.zone !== "A") continue;
        amber++;
        const { law, government } = world.profile;
        expect(law >= 9 || government === 0 || government === 7, world.uwp).toBe(true);
      }
    }
    expect(amber).toBeGreaterThan(0);
  });

  it("names its worlds mostly the way the region names things", () => {
    // SubSectorSpec 3.4.2: a region reads as a region when most of its names
    // sound related, and all of them from one flavour reads as a program.
    const names = chart.worlds.map((world) => world.name);
    expect(new Set(names).size).toBeGreaterThan(names.length / 2);
    expect(names.every((name) => name !== "")).toBe(true);
  });
});

describe("the sector file", () => {
  it("writes a line a sector map can read for every world", () => {
    const chart = generateSubsector("REGINA42", "C", "standard");
    const file = subsectorFile(chart, "Spinward Marches");
    const lines = file.split("\n").filter((line) => line !== "" && !line.startsWith("#"));
    expect(lines[0]).toBe("Hex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars");
    expect(lines).toHaveLength(chart.worlds.length + 1);
    for (const [at, world] of chart.worlds.entries()) {
      const fields = lines[at + 1]!.split("\t");
      expect(fields).toHaveLength(9);
      expect(fields[0]).toBe(world.at);
      expect(fields[1]).toBe(world.name);
      expect(fields[2]).toBe(world.uwp);
      expect(fields[3]).toBe(world.bases);
      expect(fields[5]).toBe(world.zone);
      // The three columns a single planet had to leave blank. SubSectorSpec 6.1.1.
      expect(fields[6]).toMatch(/^\d{3}$/);
      expect(fields[7]).toBe("Na");
      expect(fields[8]).not.toBe("");
    }
  });

  it("says what it is above the lines", () => {
    const file = subsectorFile(generateSubsector("VLAND7QX", "G"), "Vland");
    expect(file).toMatch(/^# Subsector G of Vland/);
    expect(file).toContain("# Seed: VLAND7QX");
  });
});

import { describe, expect, it } from "vitest";
import { hexDistance, parseSectorHex, subsectorHexes, subsectorLetter } from "../location";
import { mainWorldSeed } from "./system";
import { rollUwp } from "../planet";
import {
  DENSITIES,
  generateSubsector,
  holdsSystem,
  routesBetween,
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

  it("marks amber only where something is wrong, and red nowhere", () => {
    // SubSectorSpec 3.6.1 and 3.6.4: three things put a world in the running,
    // and red is a referee's decision about their own campaign that nothing in
    // a profile knows.
    let amber = 0;
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        expect(world.zone).not.toBe("R");
        if (world.zone !== "A") continue;
        amber++;
        const { atmosphere, government, law, population } = world.profile;
        expect(population, world.uwp).toBeGreaterThan(0);
        const wrong =
          atmosphere >= 10 ||
          government === 0 ||
          government === 7 ||
          government === 10 ||
          law === 0 ||
          law >= 9;
        expect(wrong, world.uwp).toBe(true);
      }
    }
    expect(amber).toBeGreaterThan(0);
  });

  it("posts two or three of them in a subsector rather than twenty", () => {
    // SubSectorSpec 3.6.2. Half a chart qualifies on paper; a chart where half
    // the hexes carry a warning is a chart where the warning means nothing.
    const counts = SEEDS.map(
      (seed) =>
        generateSubsector(seed, "A").worlds.filter((world) => world.zone === "A").length,
    );
    const average = counts.reduce((sum, n) => sum + n, 0) / counts.length;
    expect(average).toBeGreaterThan(1.5);
    expect(average).toBeLessThan(3.5);
    // And no chart is drowning in them, whichever way the dice fell.
    expect(Math.max(...counts)).toBeLessThan(10);
  });

  it("never flags a world nobody lives on", () => {
    // 3.6.1.1: a zone is a warning posted about somewhere people go, and most
    // of a subsector is rock nobody has been to.
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        if (world.profile.population > 0) continue;
        expect(world.zone, world.uwp).toBe("");
      }
    }
  });

  it("names its worlds mostly the way the region names things", () => {
    // SubSectorSpec 3.4.2: a region reads as a region when most of its names
    // sound related, and all of them from one flavour reads as a program.
    const names = chart.worlds.map((world) => world.name);
    expect(new Set(names).size).toBeGreaterThan(names.length / 2);
    expect(names.every((name) => name !== "")).toBe(true);
  });
});

describe("how far apart two hexes are", () => {
  // SubSectorSpec 3.9.1.1. The columns are offset, so counting rows and columns
  // separately gets it wrong, and a chart that got this wrong would draw lanes
  // between worlds that cannot reach each other.
  const at = (text: string) => parseSectorHex(text)!;

  it("counts a hex as no distance from itself", () => {
    expect(hexDistance(at("0101"), at("0101"))).toBe(0);
  });

  it("counts every neighbour of a hex as one jump", () => {
    // The six around 0202, which in this layout are the hexes above and below
    // it and the two in each of the columns either side.
    for (const near of ["0201", "0203", "0102", "0103", "0302", "0303"]) {
      expect(hexDistance(at("0202"), at(near)), near).toBe(1);
    }
  });

  it("does not count a step sideways twice", () => {
    // 0403 is two columns across and one row down from 0202, which the offset
    // pays for: two jumps, not three.
    expect(hexDistance(at("0202"), at("0403"))).toBe(2);
    expect(hexDistance(at("0101"), at("0110"))).toBe(9);
  });

  it("does not care which way round it is asked", () => {
    for (const [a, b] of [
      ["0101", "0810"],
      ["0304", "0607"],
      ["0202", "0403"],
    ]) {
      expect(hexDistance(at(a!), at(b!))).toBe(hexDistance(at(b!), at(a!)));
    }
  });
});

describe("the routes", () => {
  const charts = SEEDS.map((seed) => generateSubsector(seed, "A"));

  it("runs no route to a world nobody is on", () => {
    // SubSectorSpec 3.9.2: two inhabited worlds, or no route. A rock with a
    // beacon on it is not a destination.
    for (const chart of charts) {
      const empty = new Set(
        chart.worlds.filter((world) => world.profile.population === 0).map((world) => world.at),
      );
      for (const route of chart.routes) {
        expect(empty.has(route.from), route.from).toBe(false);
        expect(empty.has(route.to), route.to).toBe(false);
      }
    }
  });

  it("keeps every route inside two jumps", () => {
    // 3.9.2 and 3.9.3: an X-boat leg ends at a port that can service one, and a
    // trader will cross two hexes for a cargo.
    for (const chart of charts) {
      const where = new Map(chart.worlds.map((world) => [world.at, world]));
      for (const route of chart.routes) {
        const far = hexDistance(where.get(route.from)!.hex, where.get(route.to)!.hex);
        expect(far, `${route.from}-${route.to}`).toBeGreaterThan(0);
        expect(far).toBeLessThanOrEqual(2);
      }
    }
  });

  it("runs an X-boat leg only between ports that can service one", () => {
    // 3.9.2.1: a station is a class A or B port. Anywhere else the boat cannot
    // be turned round.
    let legs = 0;
    for (const chart of charts) {
      const where = new Map(chart.worlds.map((world) => [world.at, world]));
      for (const route of chart.routes) {
        if (route.kind !== "xboat") continue;
        legs++;
        for (const at of [route.from, route.to]) {
          expect("AB", `${at} ${where.get(at)!.uwp}`).toContain(where.get(at)!.profile.starport);
        }
      }
    }
    expect(legs).toBeGreaterThan(0);
  });

  it("runs a trade route only where the two worlds want what each other has", () => {
    // 3.9.3.1. Food for the worlds that grow none, manufactures for the worlds
    // that make none, and the run between somewhere rich and somewhere poor.
    const pairs = [
      ["Ag", "Na"],
      ["Ag", "In"],
      ["In", "NI"],
      ["Hi", "Lo"],
      ["Ri", "Po"],
      ["Ht", "Lt"],
    ];
    let runs = 0;
    for (const chart of charts) {
      const where = new Map(chart.worlds.map((world) => [world.at, world]));
      for (const route of chart.routes) {
        if (route.kind !== "trade") continue;
        runs++;
        const from = where.get(route.from)!.trade.map((code) => code.code);
        const to = where.get(route.to)!.trade.map((code) => code.code);
        const wants = pairs.some(
          ([one, other]) =>
            (from.includes(one!) && to.includes(other!)) ||
            (from.includes(other!) && to.includes(one!)),
        );
        expect(wants, `${route.from}-${route.to}`).toBe(true);
      }
    }
    expect(runs).toBeGreaterThan(0);
  });

  it("draws each pair once and never a world to itself", () => {
    for (const chart of charts) {
      const seen = new Set<string>();
      for (const route of chart.routes) {
        expect(route.from).not.toBe(route.to);
        const key = [route.from, route.to].sort().join("-");
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });

  it("leaves a web rather than a thicket", () => {
    // About one route per world. Enough to follow across a subsector, few
    // enough that the chart still reads.
    const worlds = charts.reduce(
      (count, chart) => count + chart.worlds.filter((w) => w.profile.population > 0).length,
      0,
    );
    const lanes = charts.reduce((count, chart) => count + chart.routes.length, 0);
    expect(lanes / worlds).toBeGreaterThan(0.3);
    expect(lanes / worlds).toBeLessThan(2.5);
  });

  it("takes an interdicted world off the web altogether", () => {
    // 3.9.2.2. Nothing generates a red zone, so this is the referee's edit of
    // 5.3 arriving at the lanes.
    const chart = generateSubsector("REGINA42", "C", "standard");
    const busy = [...chart.worlds]
      .filter((world) => world.profile.population > 0)
      .sort((a, b) => b.profile.population - a.profile.population)[0]!;
    expect(chart.routes.some((route) => route.from === busy.at || route.to === busy.at)).toBe(true);
    const shut = chart.worlds.map((world) =>
      world.at === busy.at ? { ...world, zone: "R" } : world,
    );
    const after = routesBetween(shut);
    expect(after.some((route) => route.from === busy.at || route.to === busy.at)).toBe(false);
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
